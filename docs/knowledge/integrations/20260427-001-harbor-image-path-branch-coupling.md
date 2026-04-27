# Harbor Image Path 與 GitHub 預設分支耦合

> 建立日期: 2026-04-27
> 分類: integrations
> 來源 Spec: 無（此次為部署故障排除直接提煉）
> 來源 Bug: 無（root cause 在本筆 Knowledge 內完整記載）

---

## 背景

部署到 K8s 的 azeroth-kanban 頁面打開後一直跳到 `azeroth-kanban.226network.com`（NextAuth 重導），且該域名 Cloudflare→origin SSL 壞掉返回 525。

修 NextAuth_URL 後又發現：明明 GHA 顯示 build #34 成功，v-terminal「同步」也回報 deployed，但 Pod 跑的程式碼始終跟最新 commit `c21eea6` 不同步——image digest 是個來歷不明的舊版本。

調查 GHA 日誌後才確認 root cause：CI 把 image push 到 `library/azeroth-kanban/main:{sha}`（因 `BRANCH_NAME=${{ github.ref_name }}` = `main`），但 Helm `values.yaml` 寫的是 `library/azeroth-kanban/master`。兩條路徑下的 image 是完全不同的 artifact，`master/latest` 是 GitHub 預設分支從 `master` 改名為 `main` 之前推上去的殘留。

## 知識內容

### 1. Harbor 路徑與 Git 分支耦合的設計風險

CI 把分支名拼進 image repository path（`library/{IMAGE}/{BRANCH}:{TAG}`）這個慣例本身沒錯，但會讓「分支改名」變成靜默部署風險：

- 改名前推到 `master/`
- 改名後推到 `main/`
- Helm 若沒同步改 `image.repository`，會繼續從 `master/` 拉到一個不再被更新的 image
- 因為 `pullPolicy: Always` + tag `latest` 都還能成功 pull，K8s 不會報錯，部署系統也回報 `deployed`，**沒有任何告警**

### 2. CI push tag 必須有事後驗證

GHA 日誌顯示 `docker push` 兩次都成功，但 v-terminal 同步用 sha tag 卻 ImagePullBackOff——因為它推的 path 跟拉的 path 不一樣。`set -e` 只能保證 push 命令本身回零，**不能保證對應 tag 真的出現在期待的 path 上**。

修法：build job 加一個獨立的 `Verify tags in registry` step，push 完用 `curl /v2/{repo}/tags/list` 真實打一次 Harbor，少任一 tag 就 fail pipeline（含 3 次 retry 給 Harbor index 同步緩衝）。

### 3. v-terminal 的 Image dropdown 來源是 Git，不是 Registry

v-terminal 同步 modal 的 commit 下拉是由 git log 列出來的 commit，**沒有去問 Registry** 那個 sha tag 真的存在不存在。所以 dropdown 列出 `c21eea6` 不代表 registry 真有 `:c21eea6` tag。配上路徑錯誤就會 ErrImagePull 鎖死 helm release 在 `pending-upgrade`。

### 4. Helm release 卡在 `pending-upgrade` 的解法

Migration Job（pre-upgrade hook）失敗 → helm 把 release 標 `pending-upgrade`，後續 sync/upgrade 都會被擋。處理流程：

```bash
kubectl delete job <release>-migrate -n <ns>     # 清掉失敗的 hook job
helm rollback <release> <last-good-rev> -n <ns>  # 回到上一個正常版本
# 修完真正問題（路徑、image tag）後再 helm upgrade
```

## 適用場景

- 任何「CI 推 image → Helm 拉 image」的 deploy pipeline
- 用分支名作為 image path 一部分時（branch-per-repo pattern）
- 自架 Harbor / 任何 OCI registry 配 GitHub Actions / GitLab CI
- 部署後要驗證「實際 Pod 跑的 image digest」== 「CI 剛 push 的 digest」時

## 範例

### CI 端事後驗證 step（已套用於 `.github/workflows/build.yml`）

```yaml
- name: Verify tags in registry
  env:
    REGISTRY_URL: ${{ secrets.REGISTRY_URL }}
    REGISTRY_USER: ${{ secrets.REGISTRY_USER }}
    REGISTRY_PASSWORD: ${{ secrets.REGISTRY_PASSWORD }}
  run: |
    set -euo pipefail
    PUBLIC_HOST="${REGISTRY_URL#http://}"
    PUBLIC_HOST="${PUBLIC_HOST#https://}"
    PUBLIC_HOST="${PUBLIC_HOST%%/*}"
    SHORT="${SHORT_SHA:0:7}"
    REPO_PATH="library/${IMAGE_NAME}/${BRANCH_NAME}"
    TAGS_URL="https://${PUBLIC_HOST}/v2/${REPO_PATH}/tags/list"

    for attempt in 1 2 3; do
      TAGS_JSON=$(curl -sk -u "${REGISTRY_USER}:${REGISTRY_PASSWORD}" "$TAGS_URL" || echo "")
      if echo "$TAGS_JSON" | grep -q "\"$SHORT\"" && echo "$TAGS_JSON" | grep -q '"latest"'; then
        echo "✓ Both tags present"
        exit 0
      fi
      sleep 5
    done
    echo "::error::Tags missing"
    exit 1
```

### 驗證實際部署 image 的 digest

```bash
POD=$(kubectl get pods -n $NS -l app.kubernetes.io/name=$APP --no-headers | awk '{print $1}' | head -1)
kubectl get pod $POD -n $NS -o jsonpath='{.status.containerStatuses[0].imageID}'
# 應該與 CI log 中 "digest: sha256:..." 完全相同
```

### 驗證 Registry 的 tag 跟 path 對齊

```bash
curl -sk -u admin:PASS https://registry.example.com/v2/library/$IMAGE/$BRANCH/tags/list
# tags 應包含本次 commit 的 short sha
```

## 注意事項

- **分支改名時**：必須同步更新 Helm `image.repository` 路徑，否則 deploy 表面成功但跑舊 image
- **舊 path 殘留**：改名後舊 path 下的 artifact 會變孤兒，建議從 Harbor UI 刪除，避免未來有人誤改回去又拉到上古版本
  - 本次未刪：`library/azeroth-kanban/master`（含 1 個 `:latest` tag，Harbor v2 API 對 nested repo 的 DELETE 路徑解析有 bug，需從 Harbor Web UI 手動刪除）
- **驗證 step 用 public URL**：push 走 `REGISTRY_INTERNAL_URL`（intra-cluster 快），verify 用 `REGISTRY_URL`（外部 URL，模擬 kubelet pull 的視角，避免 internal push 看似成功但 public 不可見的差異）
- **Harbor index 延遲**：剛 push 完馬上 query `/v2/.../tags/list` 偶爾 tag 還沒出現，verify step 內含 3 次 retry × 5s 緩衝
- **v-terminal 限制**：sync modal 預設選 commit-sha tag 但不 query registry 確認是否真存在；若 registry 沒對應 tag 會直接 ImagePullBackOff，此時要從 v-terminal 切到「latest（registry tag）」或 helm rollback 解卡

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-04-27: 初次建立，root cause 為 Helm `image.repository` path 用 `master`、CI 推到 `main`，導致 deploy 拉到 stale image
-->
