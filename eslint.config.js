// // @ts-check
// import tseslint from 'typescript-eslint';

// export default tseslint.config(
//   tseslint.configs.recommended,
// );

import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  tseslint.configs.recommended,
);