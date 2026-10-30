import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-fs-bg text-white">
          <div className="p-3 rounded-2xl bg-fs-danger/15 text-fs-danger mb-3 border border-fs-danger/30">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-sm font-semibold mb-1">
            {this.props.fallbackTitle || '组件加载异常'}
          </h3>
          <p className="text-xs text-fs-textMuted max-w-md mb-4 font-mono">
            {this.state.error?.message || '发生未知错误'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
            className="flex items-center space-x-1.5 rounded-xl bg-fs-primary hover:bg-fs-primaryHover px-4 py-2 text-xs font-medium text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重试加载</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
