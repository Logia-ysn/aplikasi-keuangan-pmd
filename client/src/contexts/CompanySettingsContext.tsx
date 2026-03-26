import React, { createContext, useContext, useEffect } from 'react';
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

/** Default favicon path (shipped in /public) */
const DEFAULT_FAVICON = '/favicon.svg';

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await api.get('/settings/company');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // ── Dynamic favicon & title ──────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;

    // Update page title
    if (data.companyName) {
      document.title = `Keuangan - ${data.companyName}`;
    }

    // Update favicon to company logo
    const link: HTMLLinkElement =
      document.querySelector('link[rel="icon"]') ||
      (() => {
        const el = document.createElement('link');
        el.rel = 'icon';
        document.head.appendChild(el);
        return el;
      })();

    if (data.logoUrl) {
      link.href = data.logoUrl;
      // Base64 data URLs don't need a type; for external URLs, keep svg+xml
      link.type = data.logoUrl.startsWith('data:') ? '' : 'image/svg+xml';
    } else {
      link.href = DEFAULT_FAVICON;
      link.type = 'image/svg+xml';
    }
  }, [data?.companyName, data?.logoUrl]);

  return (
    <CompanySettingsContext.Provider value={data ?? null}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export const useCompanySettings = () => useContext(CompanySettingsContext);
