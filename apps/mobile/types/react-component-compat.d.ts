export {}

// react-native 0.81 + @types/react 19 incompatibility: React 19 changed the
// Component class/interface split so that react-native class components fail
// TypeScript's JSX element class check (TS2607/TS2786).
// Adding missing members via interface augmentation makes structural checks pass.

declare module 'react-native' {
  // Text, View, Image, TouchableOpacity, etc.
  // → Constructor<NativeMethods> & typeof XComponent
  interface NativeMethods {
    props: any
    context: any
    state: any
    setState(state: any, cb?: () => void): void
    forceUpdate(cb?: () => void): void
    render(): import('react').ReactNode
  }

  // ScrollView → Constructor<ScrollResponderMixin> & typeof ScrollViewComponent
  interface ScrollResponderMixin {
    props: any
    context: any
    state: any
    setState(state: any, cb?: () => void): void
    forceUpdate(cb?: () => void): void
    render(): import('react').ReactNode
  }

  // KeyboardAvoidingView → Constructor<TimerMixin> & typeof KeyboardAvoidingViewComponent
  // (TimerMixin lives in a private submodule; augment KeyboardAvoidingView directly)
  interface TimerMixin {
    props: any
    context: any
    state: any
    setState(state: any, cb?: () => void): void
    forceUpdate(cb?: () => void): void
    render(): import('react').ReactNode
  }
  interface KeyboardAvoidingView {
    props: any
    context: any
    state: any
    setState(state: any, cb?: () => void): void
    forceUpdate(cb?: () => void): void
    render(): import('react').ReactNode
  }

  // Modal → extends React.Component directly
  interface Modal {
    props: any
    context: any
    state: any
    setState(state: any, cb?: () => void): void
    forceUpdate(cb?: () => void): void
    render(): import('react').ReactNode
  }

  // FlatList → FlatListComponent → React.Component
  interface FlatListComponent<ItemT, Props> {
    props: any
    context: any
    state: any
    setState(state: any, cb?: () => void): void
    forceUpdate(cb?: () => void): void
    render(): import('react').ReactNode
  }
}

// VideoView (expo-video) → PureComponent → Component
declare module 'expo-video' {
  interface VideoView {
    props: any
    context: any
    state: any
    setState(state: any, cb?: () => void): void
    forceUpdate(cb?: () => void): void
    render(): import('react').ReactNode
  }
}
