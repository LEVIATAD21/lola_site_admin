import React from 'react';
import { createRoot } from 'react-dom/client';
import CloudflareAdmin from './CloudflareAdmin';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz do painel ausente.');
createRoot(root).render(<React.StrictMode><CloudflareAdmin /></React.StrictMode>);
