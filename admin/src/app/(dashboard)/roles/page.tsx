'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  PiShieldCheckDuotone,
  PiPlusBold,
  PiTrashBold,
  PiPencilBold,
  PiLockKeyDuotone,
  PiGearDuotone,
  PiCheckSquareDuotone,
  PiSquareDuotone,
} from 'react-icons/pi';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirm } from '@/hooks/use-confirm';

interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  permissionCount: number;
  permissions: string[];
  createdAt: string;
}

interface PermissionItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface PermissionGroup {
  groupCode: string;
  groupName: string;
  permissions: PermissionItem[];
}

export default function RolesPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Permission modal state
  const [permissionRole, setPermissionRole] = useState<Role | null>(null);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionSaving, setPermissionSaving] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/roles');
      const json = await res.json();
      if (json.success) {
        setRoles(json.data);
      } else {
        console.error('[fetchRoles] API error:', json);
        toast.error(json.message || t('admin.roles.loadFailed'));
      }
    } catch (err) {
      console.error('[fetchRoles] Network error:', err);
      toast.error(t('admin.roles.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDisplayName.trim()) {
      toast.error(t('admin.roles.requiredFields'));
      return;
    }
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          displayName: formDisplayName.trim(),
          description: formDescription.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('admin.roles.createSuccess'));
        setShowCreateModal(false);
        resetForm();
        fetchRoles();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error(t('admin.roles.createFailed'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) {return;}
    setFormSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: formDisplayName.trim(),
          description: formDescription.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('admin.roles.updateSuccess'));
        setEditingRole(null);
        resetForm();
        fetchRoles();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error(t('admin.roles.updateFailed'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (role: Role) => {
    if (!(await confirm({ title: t('common.confirm'), message: t('admin.roles.deleteConfirm', { name: role.displayName }), type: 'danger' }))) {return;}
    try {
      const res = await fetch(`/api/v1/admin/roles/${role.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success(t('admin.roles.deleteSuccess'));
        fetchRoles();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error(t('admin.roles.deleteFailed'));
    }
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setFormDisplayName(role.displayName);
    setFormDescription(role.description || '');
  };

  const resetForm = () => {
    setFormName('');
    setFormDisplayName('');
    setFormDescription('');
  };

  // --- Permission modal ---
  const openPermissions = async (role: Role) => {
    setPermissionRole(role);
    setSelectedPermissions(new Set(role.permissions));
    setPermissionLoading(true);
    try {
      const res = await fetch('/api/v1/admin/permissions');
      const json = await res.json();
      if (json.success) {
        setPermissionGroups(json.data);
      } else {
        toast.error(t('admin.roles.loadPermissionsFailed'));
      }
    } catch {
      toast.error(t('admin.roles.loadPermissionsFailed'));
    } finally {
      setPermissionLoading(false);
    }
  };

  const togglePermission = (code: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const toggleGroupAll = (group: PermissionGroup) => {
    const allCodes = group.permissions.map((p) => p.code);
    const allChecked = allCodes.every((c) => selectedPermissions.has(c));
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        allCodes.forEach((c) => next.delete(c));
      } else {
        allCodes.forEach((c) => next.add(c));
      }
      return next;
    });
  };

  const handleSavePermissions = async () => {
    if (!permissionRole) {return;}
    setPermissionSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/roles/${permissionRole.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionCodes: Array.from(selectedPermissions) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('admin.roles.permissionsUpdated'));
        setPermissionRole(null);
        fetchRoles();
      } else {
        toast.error(json.message);
      }
    } catch {
      toast.error(t('admin.roles.updatePermissionsFailed'));
    } finally {
      setPermissionSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('admin.roles.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('admin.roles.description')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowCreateModal(true); resetForm(); }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <PiPlusBold className="w-4 h-4" />
              {t('admin.roles.create')}
            </button>
          </div>
        </div>

        {/* Role Cards */}
        {loading ? (
          <div className="rounded-lg bg-gray-0 dark:bg-gray-100 shadow border border-gray-200 p-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
            <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="rounded-lg bg-gray-0 dark:bg-gray-100 shadow border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <PiShieldCheckDuotone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {role.displayName}
                      </h3>
                      <p className="text-xs text-gray-500 font-mono">{role.name}</p>
                    </div>
                  </div>
                  {role.isSystem && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-400">
                      <PiLockKeyDuotone className="w-3 h-3" />
                      {t('admin.roles.system')}
                    </span>
                  )}
                </div>
                {role.description && (
                  <p className="mt-3 text-sm text-gray-500">
                    {role.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                  <span>{t('admin.roles.permissionCount', { count: role.permissionCount })}</span>
                  <span>{new Date(role.createdAt).toLocaleDateString('zh-TW')}</span>
                </div>
                <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => openEdit(role)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <PiPencilBold className="w-3.5 h-3.5" />
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => openPermissions(role)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    <PiGearDuotone className="w-3.5 h-3.5" />
                    {t('admin.roles.configPermissions')}
                  </button>
                  {!role.isSystem && (
                    <button
                      onClick={() => handleDelete(role)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <PiTrashBold className="w-3.5 h-3.5" />
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-gray-0 dark:bg-gray-100 p-6 shadow-xl">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t('admin.roles.create')}</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.roles.roleCode')}<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('admin.roles.roleCodePlaceholder')}
                    className="block w-full rounded-md border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.roles.displayName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    placeholder={t('admin.roles.displayNamePlaceholder')}
                    className="block w-full rounded-md border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.roles.descriptionLabel')}</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={2}
                    className="block w-full rounded-md border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t('common.create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingRole && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-gray-0 dark:bg-gray-100 p-6 shadow-xl">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {t('admin.roles.editRole')} — {editingRole.name}
              </h2>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('admin.roles.displayName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.roles.descriptionLabel')}</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={2}
                    className="block w-full rounded-md border border-gray-300 bg-gray-0 dark:bg-gray-100 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setEditingRole(null); resetForm(); }}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t('admin.roles.update')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Permissions Modal */}
        {permissionRole && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
            <div className="w-full max-w-2xl rounded-lg bg-gray-0 dark:bg-gray-100 shadow-xl flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {t('admin.roles.configPermissions')} — {permissionRole.displayName}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 font-mono">{permissionRole.name}</p>
                </div>
                <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-sm font-medium text-blue-700 dark:text-blue-300">
                  {t('admin.roles.selected', { count: selectedPermissions.size })}
                </span>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {permissionLoading ? (
                  <div className="py-12 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
                    <p className="mt-4 text-sm text-gray-500">{t('admin.roles.loadingPermissions')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {permissionGroups.map((group) => {
                      const allCodes = group.permissions.map((p) => p.code);
                      const checkedCount = allCodes.filter((c) => selectedPermissions.has(c)).length;
                      const allChecked = checkedCount === allCodes.length;
                      const someChecked = checkedCount > 0 && !allChecked;

                      return (
                        <div
                          key={group.groupCode}
                          className="rounded-lg border border-gray-200 overflow-hidden"
                        >
                          {/* Group Header */}
                          <button
                            type="button"
                            onClick={() => toggleGroupAll(group)}
                            className="flex w-full items-center gap-3 bg-gray-50 px-4 py-2.5 text-left hover:bg-gray-100 transition-colors"
                          >
                            {allChecked ? (
                              <PiCheckSquareDuotone className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                            ) : someChecked ? (
                              <div className="relative w-5 h-5 shrink-0">
                                <PiSquareDuotone className="w-5 h-5 text-gray-400" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-2.5 h-0.5 rounded bg-blue-600 dark:bg-blue-400" />
                                </div>
                              </div>
                            ) : (
                              <PiSquareDuotone className="w-5 h-5 text-gray-400 shrink-0" />
                            )}
                            <PiShieldCheckDuotone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm font-semibold text-gray-800">
                              {group.groupName}
                            </span>
                            <span className="ml-auto text-xs text-gray-500">
                              {checkedCount}/{allCodes.length}
                            </span>
                          </button>

                          {/* Permission Items */}
                          <div className="divide-y divide-gray-100">
                            {group.permissions.map((perm) => {
                              const isChecked = selectedPermissions.has(perm.code);
                              return (
                                <label
                                  key={perm.code}
                                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePermission(perm.code)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm text-gray-900">
                                      {perm.name}
                                    </span>
                                    <span className="ml-2 text-xs text-gray-400 font-mono">
                                      {perm.code}
                                    </span>
                                    {perm.description && (
                                      <p className="mt-0.5 text-xs text-gray-500 truncate">
                                        {perm.description}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setPermissionRole(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  disabled={permissionSaving}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {permissionSaving && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                  )}
                  {t('admin.roles.savePermissions')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
