import { systemPreferences } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { TranscriptionPermissions } from '../../types';

const execAsync = promisify(exec);

export class PermissionsService {
  async checkPermissions(): Promise<TranscriptionPermissions> {
    const microphone = await this.checkMicrophonePermission();
    const screenRecording = await this.checkScreenRecordingPermission();

    return {
      microphone,
      screenRecording
    };
  }

  private async checkMicrophonePermission(): Promise<'granted' | 'denied' | 'not-determined'> {
    try {
      const status = systemPreferences.getMediaAccessStatus('microphone');
      return status as 'granted' | 'denied' | 'not-determined';
    } catch (error) {
      console.error('[PermissionsService] Error checking microphone permission:', error);
      return 'not-determined';
    }
  }

  private async checkScreenRecordingPermission(): Promise<'granted' | 'denied' | 'not-determined'> {
    try {
      // Check if screen recording permission is granted
      // This uses a heuristic: try to get screen media and see if it works
      const status = systemPreferences.getMediaAccessStatus('screen');
      return status as 'granted' | 'denied' | 'not-determined';
    } catch (error) {
      console.error('[PermissionsService] Error checking screen recording permission:', error);
      return 'not-determined';
    }
  }

  async requestMicrophonePermission(): Promise<boolean> {
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('[PermissionsService] Microphone permission:', granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      console.error('[PermissionsService] Error requesting microphone permission:', error);
      return false;
    }
  }

  async requestScreenRecordingPermission(): Promise<void> {
    try {
      // Screen recording permission must be granted in System Preferences
      // We can only open System Preferences to the correct pane
      await execAsync(
        'open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"'
      );

      console.log('[PermissionsService] Opened System Preferences for screen recording permission');
    } catch (error) {
      console.error('[PermissionsService] Error opening System Preferences:', error);
    }
  }

  async ensurePermissions(): Promise<{ granted: boolean; missing: string[] }> {
    const permissions = await this.checkPermissions();
    const missing: string[] = [];

    // Check microphone
    if (permissions.microphone !== 'granted') {
      missing.push('microphone');

      // Try to request it
      const granted = await this.requestMicrophonePermission();
      if (!granted) {
        console.warn('[PermissionsService] Microphone permission not granted');
      }
    }

    // Check screen recording (needed for system audio capture)
    if (permissions.screenRecording !== 'granted') {
      missing.push('screen recording');
      console.warn('[PermissionsService] Screen recording permission not granted');
      // Don't automatically open System Preferences - let user do it manually
    }

    return {
      granted: missing.length === 0,
      missing
    };
  }
}
