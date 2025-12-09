
# Graniilate POS (Vite + React)

## Pasos para ejecutar
1. Abre la carpeta `graniilate` en Visual Studio Code.
2. En la terminal ejecuta:
   ```bash
   npm install
   npm run dev
   ```
3. Abre la URL que te muestra la terminal (por ejemplo http://localhost:5173).

Si ves un error 404, revisa:
- Que la terminal esté ejecutando `npm run dev` sin errores.
- Que estés usando el puerto correcto (Vite usa otro si el 5173 está ocupado).
- Que tengas Node 18 o 20 instalado (`node -v`).

## Compilación para producción
```bash
npm run build
npm run preview
```
Esto abre un servidor local para probar la build lista para producción.
