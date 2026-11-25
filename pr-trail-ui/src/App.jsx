import { useState } from 'react';
import LandingPage from './components/LandingPage.jsx';
import TodayLog from './components/TodayLog.jsx';
import HistoryAccordion from './components/HistoryAccordion.jsx';
import { signOut } from './api.js';

export default function App({ sessionUser }) {
  const [screen, setScreen] = useState('landing');
  const [tab, setTab]       = useState('today');
  const user = sessionUser;

  if (screen === 'landing') {
    return (
      <LandingPage
        onStart={() => { setTab('today'); setScreen('app'); }}
        onHistory={() => { setTab('history'); setScreen('app'); }}
        user={user}
      />
    );
  }

  return (
    <div className="app">
      <header>
        <img src="/hm-mark.png" alt="HypertrophyMAX" className="header-logo" />
        <nav>
          <button className={tab === 'today'   ? 'active' : ''} onClick={() => setTab('today')}>Today</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
          <button className="nav-logout" onClick={signOut} title={user?.email_id || ''}>Log out</button>
          <span style={{fontSize:'10px',color:'#444',padding:'0 6px',alignSelf:'center'}}>v15</span>
        </nav>
      </header>
      <main>
        {tab === 'today'   && <TodayLog />}
        {tab === 'history' && <HistoryAccordion />}
      </main>
    </div>
  );
}
