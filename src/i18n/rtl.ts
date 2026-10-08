import { DevSettings, I18nManager, Platform } from 'react-native';

/**
 * The app is Arabic-only and always right-to-left.
 *
 * Native builds are forced RTL from the first launch by the expo-localization
 * config plugin (`forcesRTL` in app.json). Expo Go can't use that plugin, so
 * there the first launch applies forceRTL and reloads once in development.
 * On web, direction comes from the document's `dir` attribute.
 */
export function ensureRTL(): void {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    }
    return;
  }
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  if (!I18nManager.isRTL && __DEV__) DevSettings.reload();
}
