export const ui = {
  en: {
    work: 'Work',
    about: 'About',
    contact: 'Contact',
    featured: 'Featured',
    allProjects: 'All projects',
    emailMe: 'Email me',
    madeWith: 'Made with Folioflash',
  },
  fr: {
    work: 'Réalisations',
    about: 'À propos',
    contact: 'Contact',
    featured: 'En avant',
    allProjects: 'Tous les projets',
    emailMe: 'M’écrire',
    madeWith: 'Réalisé avec Folioflash',
  },
} as const;

export type Lang = keyof typeof ui;

export const t = (lang: Lang, key: keyof (typeof ui)['en']): string => ui[lang][key];
