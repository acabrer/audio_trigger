import React, {Component, ReactNode, ErrorInfo} from 'react';
import {View, Text, TouchableOpacity, ScrollView} from 'react-native';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <View className="flex-1 bg-white p-4">
          <View className="flex-1 justify-center items-center">
            <Text className="text-2xl font-bold text-red-600 mb-2">
              Oops! Something went wrong
            </Text>
            <Text className="text-gray-600 text-center mb-4">
              The app encountered an unexpected error.
            </Text>

            <TouchableOpacity
              onPress={this.resetError}
              className="bg-blue-500 px-6 py-3 rounded-lg mb-4">
              <Text className="text-white font-semibold">Try Again</Text>
            </TouchableOpacity>

            {__DEV__ && this.state.error && (
              <ScrollView className="max-h-48 bg-gray-100 p-2 rounded-lg">
                <Text className="text-xs text-gray-700">
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text className="text-xs text-gray-600 mt-2">
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) => {
  return (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
};