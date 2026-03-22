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

const ProtectedRoute = () => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route element={<ProtectedRoute />}>
          <Route element={<CompanySettingsProvider><MainLayout /></CompanySettingsProvider>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/coa" element={<COAPage />} />
            <Route path="/gl" element={<GeneralLedger />} />
            <Route path="/sales" element={<SalesInvoices />} />
            <Route path="/purchase" element={<PurchaseInvoices />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/parties" element={<PartiesPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            
            {/* Report Routes */}
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/trial-balance" element={<TrialBalance />} />
            <Route path="/reports/profit-loss" element={<ProfitLoss />} />
            <Route path="/reports/balance-sheet" element={<BalanceSheet />} />
            <Route path="/reports/cash-flow" element={<CashFlow />} />
            <Route path="/reports/aging-ar" element={<AgingAnalysis type="Customer" />} />
            <Route path="/reports/aging-ap" element={<AgingAnalysis type="Supplier" />} />

            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/audit" element={<AuditTrail />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/recurring" element={<RecurringTransactions />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
