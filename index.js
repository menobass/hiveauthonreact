// Ensure crypto.getRandomValues is available in JS runtime (Android)
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import App from './app/index';

registerRootComponent(App);
