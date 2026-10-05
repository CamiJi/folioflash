export const ui = {
  en: {
    work: 'Work',
    about: 'About',
    contact: 'Contact',
    featured: 'Selected work',
    allProjects: 'All projects',
    emailMe: 'Email me',
    noContact: 'Contact details have not been added yet.',
    madeWith: 'Made with Folioflash',
  },
  fr: {
    work: 'Réalisations',
    about: 'À propos',
    contact: 'Contact',
    featured: 'Projets choisis',
    allProjects: 'Tous les projets',
    emailMe: 'M’écrire',
    noContact: 'Les coordonnées de contact ne sont pas encore renseignées.',
    madeWith: 'Réalisé avec Folioflash',
  },
} as const;

export type Lang = keyof typeof ui;

export const t = (lang: Lang, key: keyof (typeof ui)['en']): string => ui[lang][key];
