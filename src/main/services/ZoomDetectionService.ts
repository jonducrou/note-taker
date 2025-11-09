import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ZoomDetectionService {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private zoomMeetingActive = false;
  private onZoomStatusChange?: (isActive: boolean) => void;

  constructor() {}

  start(onStatusChange: (isActive: boolean) => void): void {
    if (this.isRunning) {
      console.warn('[ZoomDetectionService] Already running');
      return;
    }

    this.onZoomStatusChange = onStatusChange;
    this.isRunning = true;

    // Check immediately
    this.checkZoomStatus();

    // Check every 5 seconds
    this.checkInterval = setInterval(() => {
      this.checkZoomStatus();
    }, 5000);

    console.log('[ZoomDetectionService] Started');
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    this.zoomMeetingActive = false;
    console.log('[ZoomDetectionService] Stopped');
  }

  private async checkZoomStatus(): Promise<void> {
    try {
      const isActive = await this.isZoomMeetingActive();

      // Only trigger callback if status changed
      if (isActive !== this.zoomMeetingActive) {
        this.zoomMeetingActive = isActive;
        console.log('[ZoomDetectionService] Zoom meeting status changed:', isActive ? 'ACTIVE' : 'INACTIVE');

        if (this.onZoomStatusChange) {
          this.onZoomStatusChange(isActive);
        }
      }
    } catch (error) {
      console.error('[ZoomDetectionService] Error checking Zoom status:', error);
    }
  }

  private async isZoomMeetingActive(): Promise<boolean> {
    try {
      // Check for zoom.us process (Zoom meeting client)
      const { stdout } = await execAsync('pgrep -x "zoom.us"');

      // If pgrep returns output, Zoom is running
      if (stdout.trim()) {
        // Additional check: Look for Zoom window with "Zoom Meeting" in title
        // This helps distinguish between Zoom being open vs actually in a meeting
        try {
          const windowCheck = await execAsync(
            'osascript -e \'tell application "System Events" to get name of every process whose name is "zoom.us"\''
          );

          if (windowCheck.stdout.includes('zoom.us')) {
            return true;
          }
        } catch {
          // If AppleScript check fails, assume meeting is active if process exists
          return true;
        }
      }

      return false;
    } catch (error: any) {
      // pgrep returns exit code 1 if no processes found
      if (error.code === 1) {
        return false;
      }

      // Other errors should be logged
      console.error('[ZoomDetectionService] Error checking for Zoom process:', error);
      return false;
    }
  }

  getStatus(): boolean {
    return this.zoomMeetingActive;
  }

  isServiceRunning(): boolean {
    return this.isRunning;
  }
}
