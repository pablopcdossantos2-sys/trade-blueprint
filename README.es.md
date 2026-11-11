# Trade Blueprint

**Lee esto en otros idiomas:** [Português](README.md) · [English](README.en.md)

Aplicación local para ayudar al trader a prepararse antes de la sesión, organizar estudios analíticos y comparar lo planificado con lo que realmente ocurrió.

## Objetivo

La herramienta no intenta predecir el mercado. Organiza el proceso de decisión alrededor de cuatro preguntas:

1. **¿Cuál es mi tesis y qué escenarios importan para la próxima sesión?**
2. **¿Qué evidencias existen contra mi tesis?**
3. **¿Qué haré si se materializa el escenario A, B o C?**
4. **Después de la sesión, qué hizo el mercado, qué hice yo y cuánto respeté el plan original?**

## Funcionalidades actuales — v0.12

### Sistema de trading

Las dos partes del método están reunidas en una sola pantalla:

- **Reglas generales:** límites de Entrada, Salida, Riesgo, Horario, Contexto y Comportamiento, con justificación, activación/desactivación e imágenes;
- **Setups operativos:** patrones reutilizables con contexto, criterios de entrada, confirmación, invalidación, stop, gestión, situaciones a evitar y cuidados conductuales;
- aplicación de un setup al escenario A de un plan.

La primera utilización incluye registros ficticios identificados con la etiqueta **Ejemplo**. Cada ejemplo puede eliminarse individualmente.

### Planes de trading

- plan por activo y fecha;
- sesgo y **convicción declarada de la tesis**;
- contexto, niveles, eventos y riesgo máximo;
- condiciones para no operar;
- **evidencias contra la tesis**;
- campo **“¿qué tendría que ocurrir para que cambie de opinión?”**;
- escenarios A/B/C;
- plan conductual;
- imágenes;
- congelación e historial de versiones;
- revisión posterior;
- comparación **Planificado × Mercado real × Mi ejecución**.

### Calidad de la preparación

Antes de congelar un plan, la aplicación muestra un **score de completitud de la preparación** e identifica campos importantes pendientes.

El score:

- mide únicamente la completitud del proceso;
- **no predice el mercado**;
- **no es una señal de entrada**;
- alerta sobre lagunas críticas sin bloquear obligatoriamente al trader.

El checklist premercado ahora registra estado **concluido/no concluido**.

También es posible:

- guardar un plan como **plantilla**;
- crear planes a partir de plantillas;
- duplicar un plan anterior **sin copiar su revisión**.

### Estudios

La sección **Estudios** se mantiene separada de los Planes de Trading y permite análisis que no necesitan estar vinculados a una operación futura.

### Historial

La sección **Historial** agrega el aprendizaje a lo largo del tiempo:

- calendario de sesiones planificadas y revisadas;
- filtros por activo, setup, escenario, adherencia y período;
- adherencia por setup;
- reglas más violadas;
- ejecución planificada × parcialmente planificada × improvisada;
- calidad de la lectura × calidad de la ejecución;
- búsqueda textual en planes/revisiones, reglas y setups;
- galería histórica de imágenes.

Las revisiones posteriores incluyen campos estructurados que alimentan estas métricas sin depender solo de interpretación de texto libre.

### Integración con diario de trades

En **Historial** se pueden importar ejecuciones en **JSON o CSV** y vincularlas a los planes.

- vínculo automático por fecha + activo cuando existe un único plan compatible;
- vínculo manual a plan y escenario A/B/C;
- importación de horarios, precios, cantidad, dirección y resultado;
- relleno no destructivo de la revisión cuando sea posible;
- detección de trades sin plan o sin escenario preplanificado;
- informe **Planifiqué × operé × registré**.

Formato y ejemplos: [`docs/JOURNAL-INTEGRATION.md`](docs/JOURNAL-INTEGRATION.md).

### Entrenamiento deliberado

La sección **Entrenamiento** convierte el historial en ejercicios prácticos:

- Replay de planes congelados sin mostrar inicialmente el desenlace;
- revisión automática de planes con baja adherencia;
- ejercicios basados en las reglas que el trader viola con mayor frecuencia;
- comparación **“lo que pensé entonces” × “cómo lo interpreto ahora”**;
- biblioteca personal de ejemplos **correctos e incorrectos** por setup.

En el Replay, el mercado real y la ejecución original solo aparecen después de registrar una nueva decisión y lectura.

## Instalación y uso en Windows

Hay dos formas de usar el proyecto.

### Opción 1 — Instalar la aplicación de Windows

Cuando exista un instalador publicado en **Releases**:

1. abre el repositorio en GitHub;
2. entra en **Releases**;
3. abre la versión más reciente;
4. descarga el instalador de Windows, normalmente con un nombre similar a:
   ```text
   Trade-Blueprint-0.x.x-Windows-x64-setup.exe
   ```
5. haz doble clic en el archivo;
6. sigue las pantallas del instalador;
7. abre **Trade Blueprint** desde el menú Inicio.

Las versiones oficiales con updater habilitado podrán buscar nuevas versiones en **Configuración > Aplicación de escritorio y actualizaciones**.

> Si todavía no existe una Release con instalador, utiliza la opción siguiente.

### Opción 2 — Ejecutar desde el código

#### 1. Instala Node.js

Instala una versión actual de **Node.js LTS**.

#### 2. Descarga el proyecto

En GitHub:

1. haz clic en **Code**;
2. haz clic en **Download ZIP**;
3. extrae el ZIP;
4. abre la carpeta extraída.

#### 3. Abre el Símbolo del sistema en esa carpeta

En el Explorador de Windows:

1. haz clic en la barra de direcciones;
2. escribe:
   ```text
   cmd
   ```
3. pulsa **Enter**.

El Símbolo del sistema se abrirá directamente en la carpeta correcta.

#### 4. Instala las dependencias

Ejecuta:

```bash
npm install
```

Espera a que termine.

#### 5. Inicia la aplicación

Ejecuta:

```bash
npm run dev
```

Cuando aparezca algo similar a:

```text
Local: http://localhost:5173/
```

abre esa dirección en el navegador.

Mantén la ventana del terminal abierta mientras uses el servidor local. Para detenerlo, vuelve al terminal y pulsa **Ctrl + C**.

### Verificaciones opcionales

```bash
npm run typecheck
npm run build
```

La generación del instalador de escritorio requiere herramientas adicionales. Consulta [`docs/DESKTOP.md`](docs/DESKTOP.md) solo si deseas desarrollar o empaquetar la aplicación.

