import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const SingSubPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fff1f4',
      100: '#ffe3e9',
      200: '#ffcbd6',
      300: '#fcaabd',
      400: '#f596aa',
      500: '#eb6f8a',
      600: '#d94e70',
      700: '#b73859',
      800: '#982f4d',
      900: '#812b45',
      950: '#481321',
    },
    borderRadius: {
      none: '0',
      xs: '2px',
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '8px',
    },
  },
});

export const primeVueOptions = {
  ripple: true,
  inputVariant: 'outlined' as const,
  theme: {
    preset: SingSubPreset,
    options: {
      darkModeSelector: '.app-dark',
      cssLayer: false,
    },
  },
};
