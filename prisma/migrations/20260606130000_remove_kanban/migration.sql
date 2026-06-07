-- 移除 Kanban 看板功能：DROP FK / table / enum

-- DropForeignKey
ALTER TABLE "kanban_card" DROP CONSTRAINT IF EXISTS "kanban_card_owner_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "kanban_card";

-- DropEnum
DROP TYPE IF EXISTS "CardStatus";
