export const WEB_VIEWS = ['place', 'chart', 'time'] as const;
export type WebView = (typeof WEB_VIEWS)[number];
export const WEB_VIEW_LABELS: Record<WebView, string> = { place: 'Place', chart: 'Chart', time: 'Time' };
export const SWITCH_TO_CHART = 'Switch to Chart to change the web.';

// Place needs the picture library; without it the lesson opens on Chart, as before.
export const availableViews = (libraryLoaded: boolean): WebView[] => WEB_VIEWS.filter((view) => libraryLoaded || view !== 'place');

export const initialView = (libraryLoaded: boolean): WebView => (libraryLoaded ? 'place' : 'chart');

// Species are tapped on the Chart's rings or among the animals in Place; a graph has nothing to tap, so it points there.
export const editHintFor = (view: WebView, hint: string): string => (view === 'time' ? `${hint} ${SWITCH_TO_CHART}` : hint);
