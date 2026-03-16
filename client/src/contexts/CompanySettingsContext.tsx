import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface CompanySettings {
  id: string;
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  defaultCurrency: string;
}

const CompanySettingsContext = createContext<CompanySettings | null>(null);

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      try {
        const res = await api.get('/settings/company');
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <CompanySettingsContext.Provider value={data ?? null}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export const useCompanySettings = () => useContext(CompanySettingsContext);
