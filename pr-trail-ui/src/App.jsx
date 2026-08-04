import { useState } from 'react';
import LandingPage from './components/LandingPage.jsx';
import TodayLog from './components/TodayLog.jsx';
import HistoryAccordion from './components/HistoryAccordion.jsx';

export default function App() {
  const [screen, setScreen] = useState('landing');
  const [tab, setTab]       = useState('today');

  if (screen === 'landing') {
    return <LandingPage onStart={() => setScreen('app')} />;
  }

  return (
    <div className="app">
      <header>
        <img src="/ownpr-logo.png" alt="OwnPR" className="header-logo" />
        <nav>
          <button className={tab === 'today'   ? 'active' : ''} onClick={() => setTab('today')}>Today</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
        </nav>
      </header>
      <main>
        {tab === 'today'   && <TodayLog />}
        {tab === 'history' && <HistoryAccordion />}
      </main>
    </div>
  );
}
