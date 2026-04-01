import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { Save, Loader2, AlertTriangle, Plus, X, ChevronDown } from 'lucide-react';

interface RoleMeta {
  key: string;
  label: string;
  description: string;
  multiAccount: boolean;
  required: boolean;
  expectedRootType: string;
}

interface MappingEntry {
  id: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  sortOrder: number;
}

interface SystemAccountsData {
  mappings: Record<string, MappingEntry[]>;
  roles: RoleMeta[];
}

interface AccountOption {
  id: string;
  accountNumber: string;
  name: string;
  rootType: string;
  isGroup: boolean;
  isActive: boolean;
}

const ROLE_GROUPS = [
  { title: 'Kas & Bank', roles: ['CASH'] },
  { title: 'Piutang & Hutang', roles: ['AR', 'AP', 'ALLOWANCE_DOUBTFUL', 'BAD_DEBT_EXPENSE'] },
  { title: 'Persediaan & HPP', roles: ['INVENTORY', 'COGS'] },
  { title: 'Pendapatan', roles: ['SALES', 'SERVICE_REVENUE', 'SALES_DISCOUNT', 'SALES_RETURN'] },
  { title: 'Pajak', roles: ['TAX_INPUT', 'TAX_OUTPUT', 'INCOME_TAX_EXPENSE'] },
  { title: 'Deposit', roles: ['VENDOR_DEPOSIT', 'CUSTOMER_DEPOSIT'] },
  { title: 'Aset Tetap & Depresiasi', roles: ['FIXED_ASSET', 'ACCUM_DEPRECIATION', 'DEPRECIATION_EXPENSE'] },
  { title: 'Biaya Bank & Bunga', roles: ['BANK_CHARGE', 'INTEREST_EXPENSE', 'INTEREST_INCOME'] },
  { title: 'Akrual & Dibayar Dimuka', roles: ['PREPAID_EXPENSE', 'ACCRUED_EXPENSE'] },
  { title: 'Pendapatan & Beban Lain-lain', roles: ['OTHER_INCOME', 'OTHER_EXPENSE', 'FX_GAIN_LOSS', 'FX_UNREALIZED', 'SHIPPING_EXPENSE', 'ROUNDING_ACCOUNT'] },
  { title: 'Ekuitas', roles: ['OPENING_EQUITY', 'RETAINED_EARNINGS', 'CURRENT_PROFIT', 'OWNER_DRAWING'] },
];

export const SystemAccountsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<Record<string, string[]>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<SystemAccountsData>({
    queryKey: ['system-accounts'],
    queryFn: async () => {
      const res = await api.get('/system-accounts');
      return res.data;
    },
  });

  const { data: accounts } = useQuery<AccountOption[]>({
    queryKey: ['coa-options'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      return res.data.filter((a: AccountOption) => a.isActive);
    },
  });

  // Initialize edit state from server data
  const currentMappings = useMemo(() => {
    if (!data) return {};
    const result: Record<string, string[]> = {};
    for (const role of data.roles) {
      const entries = data.mappings[role.key] ?? [];
      result[role.key] = entries.map((e) => e.accountId);
    }
    return result;
  }, [data]);

  const getEditValue = (role: string): string[] => {
    return editState[role] ?? currentMappings[role] ?? [];
  };

  const updateRole = (role: string, accountIds: string[]) => {
    setEditState((prev) => ({ ...prev, [role]: accountIds }));
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const mappings: { role: string; accountId: string; sortOrder: number }[] = [];
      for (const [role, accountIds] of Object.entries(editState)) {
        accountIds.forEach((accountId, idx) => {
          mappings.push({ role, accountId, sortOrder: idx });
        });
      }
      if (mappings.length === 0) return;
      await api.put('/system-accounts', { mappings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-accounts'] });
      setEditState({});
      setHasChanges(false);
      toast.success('Konfigurasi akun sistem berhasil disimpan.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Gagal menyimpan konfigurasi.');
    },
  });

  const getRoleMeta = (key: string): RoleMeta | undefined => {
    return data?.roles.find((r) => r.key === key);
  };

  const getFilteredAccounts = (expectedRootType: string): AccountOption[] => {
    if (!accounts) return [];
    return accounts
      .filter((a) => a.rootType === expectedRootType)
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Akun Sistem</h2>
          <p className="text-sm text-gray-500">
            Konfigurasi akun COA yang digunakan sistem untuk auto GL posting.
          </p>
        </div>
        {hasChanges && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Simpan Perubahan
          </button>
        )}
      </div>

      {ROLE_GROUPS.map((group) => (
        <div key={group.title} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">{group.title}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {group.roles.map((roleKey) => {
              const meta = getRoleMeta(roleKey);
              if (!meta) return null;
              const selectedIds = getEditValue(roleKey);
              const isMissing = meta.required && selectedIds.length === 0;
              const filteredAccounts = getFilteredAccounts(meta.expectedRootType);

              return (
                <div key={roleKey} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{meta.label}</span>
                        {meta.required && (
                          <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            Wajib
                          </span>
                        )}
                        {isMissing && (
                          <AlertTriangle size={14} className="text-amber-500" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                    </div>

                    <div className="flex-shrink-0 w-72">
                      {meta.multiAccount ? (
                        // Multi-account selector (CASH)
                        <div className="space-y-2">
                          {selectedIds.map((accId, idx) => (
                            <div key={accId} className="flex items-center gap-1">
                              <select
                                value={accId}
                                onChange={(e) => {
                                  const newIds = [...selectedIds];
                                  newIds[idx] = e.target.value;
                                  updateRole(roleKey, newIds);
                                }}
                                className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              >
                                {filteredAccounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.accountNumber} - {acc.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => {
                                  updateRole(roleKey, selectedIds.filter((_, i) => i !== idx));
                                }}
                                className="p-1 text-gray-400 hover:text-red-500"
                                title="Hapus"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const unused = filteredAccounts.find(
                                (a) => !selectedIds.includes(a.id),
                              );
                              if (unused) {
                                updateRole(roleKey, [...selectedIds, unused.id]);
                              }
                            }}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                          >
                            <Plus size={12} />
                            Tambah Akun
                          </button>
                        </div>
                      ) : (
                        // Single account selector
                        <div className="relative">
                          <select
                            value={selectedIds[0] ?? ''}
                            onChange={(e) => {
                              updateRole(roleKey, e.target.value ? [e.target.value] : []);
                            }}
                            className="w-full text-xs border border-gray-300 rounded-md px-2 py-1.5 pr-8 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                          >
                            <option value="">-- Pilih Akun --</option>
                            {filteredAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.accountNumber} - {acc.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={14}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
