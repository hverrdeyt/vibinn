import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function getCurrentDevicePosition(options?: {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}) {
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: options?.enableHighAccuracy ?? true,
    timeout: options?.timeout ?? 10000,
    maximumAge: options?.maximumAge ?? 60000,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

export async function openExternalUrl(url: string) {
  if (isNativeApp()) {
    await Browser.open({ url });
    return;
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function shareNativeContent(input: {
  title?: string;
  text?: string;
  url?: string;
  files?: string[];
}) {
  await Share.share({
    title: input.title,
    text: input.text,
    url: input.url,
    files: input.files,
    dialogTitle: input.title,
  });
}
