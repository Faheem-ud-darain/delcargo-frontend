import { Injectable } from '@angular/core';
import { NativeAudio } from '@capacitor-community/native-audio';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private soundsLoaded = false;
  private isNative = Capacitor.isNativePlatform();

  // Web-only Audio objects (keyed by assetId)
  private webAudio: Record<string, HTMLAudioElement> = {};

  constructor() {
    if (!this.isNative) {
      // Pre-create Audio objects on web so they're ready instantly
      this.webAudio['success_beep'] = new Audio('assets/sounds/success.mp3');
      this.webAudio['error_beep']   = new Audio('assets/sounds/error.mp3');
      this.webAudio['success_beep'].load();
      this.webAudio['error_beep'].load();
    }
  }

  async preloadSounds() {
    if (!this.isNative || this.soundsLoaded) return;
    try {
      await NativeAudio.preload({
        assetId: 'success_beep',
        assetPath: 'public/assets/sounds/success.mp3',
        audioChannelNum: 1,
        volume: 0.8,
        isUrl: false
      });
      await NativeAudio.preload({
        assetId: 'error_beep',
        assetPath: 'public/assets/sounds/error.mp3',
        audioChannelNum: 1,
        volume: 0.8,
        isUrl: false
      });
      this.soundsLoaded = true;
      console.log('Sounds loaded successfully');
    } catch (error) {
      console.error('Error loading sounds:', error);
    }
  }

  async playSound(soundId: string) {
    if (!this.isNative) {
      // Web: use HTML5 Audio
      const audio = this.webAudio[soundId];
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {}); // ignore autoplay policy errors silently
      }
      return;
    }

    // Native: use NativeAudio
    if (!this.soundsLoaded) {
      await this.preloadSounds();
    }
    try {
      await NativeAudio.play({ assetId: soundId });
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  async stopSound(soundId: string) {
    if (!this.isNative) {
      this.webAudio[soundId]?.pause();
      return;
    }
    try {
      await NativeAudio.stop({ assetId: soundId });
    } catch (error) {
      console.error('Error stopping sound:', error);
    }
  }

  async loopSound(soundId: string) {
    if (!this.isNative) {
      const audio = this.webAudio[soundId];
      if (audio) { audio.loop = true; audio.play().catch(() => {}); }
      return;
    }
    try {
      await NativeAudio.loop({ assetId: soundId });
    } catch (error) {
      console.error('Error looping sound:', error);
    }
  }

  async setVolume(soundId: string, volume: number) {
    if (!this.isNative) {
      if (this.webAudio[soundId]) this.webAudio[soundId].volume = volume;
      return;
    }
    try {
      await NativeAudio.setVolume({ assetId: soundId, volume });
    } catch (error) {
      console.error('Error setting volume:', error);
    }
  }

  async unloadSounds() {
    if (!this.isNative) return;
    try {
      await NativeAudio.unload({ assetId: 'success_beep' });
      await NativeAudio.unload({ assetId: 'error_beep' });
      this.soundsLoaded = false;
    } catch (error) {
      console.error('Error unloading sounds:', error);
    }
  }
}
