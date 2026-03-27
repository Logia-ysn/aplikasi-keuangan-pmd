import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { CompanySettingsProvider } from './contexts/CompanySettingsContext';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { GeneralLedger } from './pages/GeneralLedger';
import { COAPage } from './pages/COAPage';
import { SalesInvoices } from './pages/SalesInvoices';
import { PurchaseInvoices } from './pages/PurchaseInvoices';
import { Payments } from './pages/Payments';
import { PartiesPage } from './pages/PartiesPage';
import { InventoryPage } from './pages/InventoryPage';
import LoginPage from './pages/LoginPage';

import Reports from './pages/Reports';
import TrialBalance from './pages/reports/TrialBalance';
import ProfitLoss from './pages/reports/ProfitLoss';
import BalanceSheet from './pages/reports/BalanceSheet';
import AgingAnalysis from './pages/reports/AgingAnalysis';
import CashFlow from './pages/reports/CashFlow';
import { SettingsPage } from './pages/Settings';
import { UserManagement } from './pages/UserManagement';
import { AuditTrail } from './pages/AuditTrail';
import { Notifications } from './pages/Notifications';
import { RecurringTransactions } from './pages/RecurringTransactions';
import { BankReconciliation } from './pages/BankReconciliation';
import TaxReport from './pages/reports/TaxReport';


const ProtectedRoute = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

function getUserRole(): string | null {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.role ?? null; }
  catch { return null; }
}

const RoleRoute = ({ allowed, children }: { allowed: string[]; children: React.ReactNode }) => {
  const role = getUserRole();
  if (role && !allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

// Shorthand: routes only accessible to finance roles (not StaffProduksi)
const FinanceRoute = ({ children }: { children: React.ReactNode }) => (
  <RoleRoute allowed={['Admin', 'Accountant', 'Viewer']}>{children}</RoleRoute>
);
const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <RoleRoute allowed={['Admin']}>{children}</RoleRoute>
);

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route element={<ProtectedRoute />}>
          <Route element={<CompanySettingsProvider><MainLayout /></CompanySettingsProvider>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/coa" element={<FinanceRoute><COAPage /></FinanceRoute>} />
            <Route path="/gl" element={<FinanceRoute><GeneralLedger /></FinanceRoute>} />
            <Route path="/sales" element={<FinanceRoute><SalesInvoices /></FinanceRoute>} />
            <Route path="/purchase" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi']}><PurchaseInvoices /></RoleRoute>} />
            <Route path="/payments" element={<FinanceRoute><Payments /></FinanceRoute>} />
            <Route path="/parties" element={<RoleRoute allowed={['Admin', 'Accountant', 'StaffProduksi']}><PartiesPage /></RoleRoute>} />
            <Route path="/inventory" element={<InventoryPage />} />

            {/* Report Routes */}
            <Route path="/reports" element={<FinanceRoute><Reports /></FinanceRoute>} />
            <Route path="/reports/trial-balance" element={<FinanceRoute><TrialBalance /></FinanceRoute>} />
            <Route path="/reports/profit-loss" element={<FinanceRoute><ProfitLoss /></FinanceRoute>} />
            <Route path="/reports/balance-sheet" element={<FinanceRoute><BalanceSheet /></FinanceRoute>} />
            <Route path="/reports/cash-flow" element={<FinanceRoute><CashFlow /></FinanceRoute>} />
            <Route path="/reports/aging-ar" element={<FinanceRoute><AgingAnalysis type="Customer" /></FinanceRoute>} />
            <Route path="/reports/aging-ap" element={<FinanceRoute><AgingAnalysis type="Supplier" /></FinanceRoute>} />
            <Route path="/reports/tax" element={<FinanceRoute><TaxReport /></FinanceRoute>} />

            <Route path="/reconciliation" element={<FinanceRoute><BankReconciliation /></FinanceRoute>} />
            <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
            <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
            <Route path="/audit" element={<AdminRoute><AuditTrail /></AdminRoute>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/recurring" element={<FinanceRoute><RecurringTransactions /></FinanceRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
