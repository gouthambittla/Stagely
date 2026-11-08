import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) {
      console.error('[ErrorBoundary] Uncaught render error:', error, info?.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          An unexpected error occurred. Please try again.
        </Text>
        <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0D13',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center'
  },
  message: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28
  },
  button: {
    backgroundColor: '#F5A623',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12
  },
  buttonText: {
    color: '#0B0D13',
    fontSize: 16,
    fontWeight: '700'
  }
});

export default ErrorBoundary;
