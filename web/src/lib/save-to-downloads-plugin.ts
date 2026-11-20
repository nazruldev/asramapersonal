import { registerPlugin } from '@capacitor/core';

export type SaveToDownloadsResult = {
  uri: string;
};

export interface SaveToDownloadsPlugin {
  saveBase64(options: {
    filename: string;
    data: string;
    mimeType?: string;
  }): Promise<SaveToDownloadsResult>;
}

export const SaveToDownloads = registerPlugin<SaveToDownloadsPlugin>('SaveToDownloads');
