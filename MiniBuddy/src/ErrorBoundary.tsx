import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
  error?: Error
  resetKey: number
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, resetKey: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error.message)
    console.error('[ErrorBoundary] Stack:', errorInfo.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, resetKey: this.state.resetKey + 1 })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-white p-8">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="mb-4">
            <circle cx="24" cy="24" r="20" stroke="#C9CDD4" strokeWidth="2"/>
            <path d="M18 18l12 12M30 18l-12 12" stroke="#C9CDD4" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <h2 className="text-[16px] font-medium text-[#4E5969] mb-2">页面遇到了问题</h2>
          <p className="text-[13px] text-[#86909C] mb-4 text-center max-w-md">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-1.5 rounded-lg bg-[#1D2129] text-white text-[12px] hover:bg-[#4E5969] transition-colors"
          >
            重新加载
          </button>
        </div>
      )
    }
    return <div key={this.state.resetKey}>{this.props.children}</div>
  }
}
