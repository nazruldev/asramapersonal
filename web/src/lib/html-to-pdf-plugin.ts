import { registerPlugin } from '@capacitor/core';

export type HtmlToPdfResult = {
  uri: string;
};

export interface HtmlToPdfPlugin {
  fromHtml(options: {
    html: string;
    filename: string;
    landscape?: boolean;
    /** Buka PDF di aplikasi pembaca setelah tersimpan (Android). */
    openAfterSave?: boolean;
  }): Promise<HtmlToPdfResult>;
}

export const HtmlToPdf = registerPlugin<HtmlToPdfPlugin>('HtmlToPdf');
