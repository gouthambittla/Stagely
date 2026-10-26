declare module 'react-native-svg' {
  import { ViewProps } from 'react-native';
  export interface SvgProps extends ViewProps {
    color?: string;
    stroke?: string;
    fill?: string;
    width?: number | string;
    height?: number | string;
    strokeWidth?: number | string;
  }
}
