import { render } from 'preact';
import { App } from './ui/App.tsx';
import './styles/app.css';

// Always open at the top. Mobile browsers otherwise restore an old scroll position once
// the league data arrives, which can leave the league switcher scrolled out of view.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

render(<App />, document.getElementById('app')!);
