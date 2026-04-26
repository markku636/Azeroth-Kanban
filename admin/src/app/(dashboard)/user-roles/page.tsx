'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PiUserGearDuotone,
  PiShieldCheckDuotone,
  PiRadioButtonBold,
  PiCircleDuotone,
  PiXCircleBold,
} from 'react-icons/pi';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/use-translation';

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string | null;
  isActive: boolean;
}

interface RoleItem {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
}

export default function UserRolesPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [allRoles, setAllRoles] = useState<RoleItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/users');
      const json = await res.json();
      if (json.success) {
        setUsers(json.data);
      } else {
        toast.error(json.message || '載入使用者失敗');
      }
    } catch {
      toast.error('載入使用者失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const res = await fetch('/api/v1/admin/roles');
      const json = await res.json();
      if (json.success) {
        setAllRoles(json.data);
      }
    } catch {
      // ignore
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openEditModal = (user: UserItem) => {
    setEditUser(user);
    setSelectedRole(user.role);
    if (allRoles.length === 0) fetchRoles();
  };

  const handleSave = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${editUser.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleName: selectedRole }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('使用者角色已更新');
        setUsers((prev) =>
          prev.map((u) => (u.id === editUser.id ? { ...u, role: selectedRole } : u))
        );
        setEditUser(null);
      } else {
        toast.error(json.message || '更新失敗');
      }
    } catch {
      toast.error('更新失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">使用者角色</h1>
          <p className="mt-1 text-sm text-gray-500">
            指派使用者的系統角色
          </p>
        </div>

        {loading ? (
          <div className="rounded-lg bg-gray-0 dark:bg-gray-100 shadow border border-gray-200 p-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
            <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-lg bg-gray-0 dark:bg-gray-100 shadow border border-gray-200 p-8 text-center">
            <PiUserGearDuotone className="mx-auto w-12 h-12 text-gray-300" />
            <p className="mt-4 text-sm text-gray-500">尚無使用者</p>
          </div>
        ) : (
          <div className="rounded-lg bg-gray-0 dark:bg-gray-100 shadow border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      使用者
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      角色
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      動作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {user.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.role ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300">
                            <PiShieldCheckDuotone className="w-3 h-3" />
                            {user.role}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">無</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <PiUserGearDuotone className="w-4 h-4" />
                          指派角色
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {editUser && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-lg bg-gray-0 dark:bg-gray-100 shadow-xl flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">指派角色</h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {editUser.name}（{editUser.email}）
                  </p>
                </div>
                {selectedRole && (
                  <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-sm font-medium text-blue-700 dark:text-blue-300">
                    {selectedRole}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {rolesLoading ? (
                  <div className="py-12 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="role-select"
                        checked={selectedRole === null}
                        onChange={() => setSelectedRole(null)}
                        className="sr-only"
                      />
                      <span className="shrink-0">
                        {selectedRole === null ? (
                          <PiRadioButtonBold className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <PiCircleDuotone className="w-5 h-5 text-gray-400" />
                        )}
                      </span>
                      <span className="flex items-center gap-1.5 text-sm text-gray-500">
                        <PiXCircleBold className="w-3.5 h-3.5" />
                        無角色
                      </span>
                    </label>

                    {allRoles.map((role) => {
                      const isSelected = selectedRole === role.name;
                      return (
                        <label
                          key={role.id}
                          className="flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <input
                            type="radio"
                            name="role-select"
                            checked={isSelected}
                            onChange={() => setSelectedRole(role.name)}
                            className="sr-only"
                          />
                          <span className="shrink-0">
                            {isSelected ? (
                              <PiRadioButtonBold className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <PiCircleDuotone className="w-5 h-5 text-gray-400" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-gray-900">
                              {role.displayName}（{role.name}）
                            </span>
                            {role.description && (
                              <p className="mt-0.5 text-xs text-gray-500">
                                {role.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                  )}
                  儲存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
