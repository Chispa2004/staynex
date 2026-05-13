'use client';

import { PageHeader } from './PageHeader';

export const PlaceholderPage = ({ title, description, titleKey, descriptionKey }) => (
  <section className="space-y-6">
    <PageHeader
      eyebrowKey="app.hotelOperations"
      titleKey={titleKey}
      descriptionKey={descriptionKey}
      fallbackTitle={title}
      fallbackDescription={description}
    />

    <div className="rounded-lg border border-dashed border-borderline bg-panel/60 px-6 py-10 text-sm text-slate-400">
      Preparado para la siguiente fase del dashboard.
    </div>
  </section>
);
