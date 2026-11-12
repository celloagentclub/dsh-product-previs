import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

export class ViewportBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('三维视口错误', error, info.componentStack); }
  render() {
    if (this.state.error) return <div className="viewport-error" role="alert"><strong>三维视口未能载入</strong><p>{this.state.error}</p><button onClick={() => this.setState({ error: null })}><RefreshCw size={13} />重新加载视口</button></div>;
    return this.props.children;
  }
}
