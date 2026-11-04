// Minimal typings for the parts of gapi + Google Picker this app uses.
// https://developers.google.com/drive/picker/reference

declare namespace google.picker {
  enum Action {
    PICKED = "picked",
    CANCEL = "cancel",
  }
  enum ViewId {
    SPREADSHEETS = "spreadsheets",
  }
  enum DocsViewMode {
    LIST = "list",
  }
  interface PickerDocument {
    id: string;
    name: string;
  }
  interface ResponseObject {
    action: string;
    docs?: PickerDocument[];
  }
  class DocsView {
    constructor(viewId?: ViewId);
    setMode(mode: DocsViewMode): DocsView;
    setIncludeFolders(include: boolean): DocsView;
  }
  class PickerBuilder {
    addView(view: DocsView): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setDeveloperKey(key: string): PickerBuilder;
    setAppId(appId: string): PickerBuilder;
    setTitle(title: string): PickerBuilder;
    setCallback(cb: (data: ResponseObject) => void): PickerBuilder;
    build(): { setVisible(visible: boolean): void };
  }
}

interface Window {
  gapi?: {
    load(api: string, options: { callback: () => void; onerror?: () => void }): void;
  };
}
