import { useState } from 'react';
import { api } from './api';
import Auth from './components/Auth';
import AccountingPage from './pages/AccountingPage';
import FleetPage from './pages/FleetPage';
import HrPage from './pages/HrPage';

const TABS = [
  { key: 'accounting', label: 'ERP / Accounting', Component: AccountingPage },
  { key: 'fleet', label: 'Fleet Management', Component: FleetPage },
  { key: 'hr', label: 'HR / Payroll', Component: HrPage },
];

export default function App() {
  const [session, setSession] = useState(null); // { accessToken, companyId, companyName }
  const [activeTab, setActiveTab] = useState('accounting');

  function handleAuthenticated(nextSession) {
    api.setToken(nextSession.accessToken);
    setSession(nextSession);
  }

  function signOut() {
    api.setToken(null);
    setSession(null);
  }

  if (!session) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <h1>ERP · Fleet · HR/Payroll</h1>
          <span className="meta">MERN reference implementation</span>
        </div>
        <Auth onAuthenticated={handleAuthenticated} />
      </div>
    );
  }

  const Active = TABS.find((t) => t.key === activeTab).Component;

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>{session.companyName}</h1>
        <span className="meta">
          signed in &middot; <a style={{ color: 'white' }} href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>sign out</a>
        </span>
      </div>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={t.key === activeTab ? 'active' : ''} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <Active />
    </div>
  );
}
