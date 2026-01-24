/**
 * Error Boundary for Popup
 *
 * Catches React errors and provides fallback UI with recovery options.
 */

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleClose = () => {
    window.close();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠️</div>
          <div className="error-boundary-title">Something went wrong</div>
          <div className="error-boundary-message">
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <div className="error-boundary-actions">
            <button className="btn btn-primary" onClick={this.handleReset}>
              Try Again
            </button>
            <button className="btn btn-secondary" onClick={this.handleClose}>
              Close Popup
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
