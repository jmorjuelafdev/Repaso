const form = document.getElementById("formTecnologias");
const selector = document.getElementById("tecnologias");
const contenedor = document.getElementById("contenido");
const panelEstado = document.getElementById("estadoQuiz");
const estadoTecnologia = document.getElementById("estadoTecnologia");
const estadoProgreso = document.getElementById("estadoProgreso");
const estadoPuntaje = document.getElementById("estadoPuntaje");
const estadoTiempo = document.getElementById("estadoTiempo");
const barraProgreso = document.getElementById("barraProgreso");

let preguntas = [];
let preguntasFiltradas = [];
let indiceActual = 0;
let puntajeTotal = 0;
let respuestasCorrectas = 0;
let temporizador = null;
let segundosRestantes = 0;
let preguntaRespondida = false;
let estadoPreguntas = [];

function escaparHtml(texto) {
    const valor = String(texto ?? "");
    const reemplazos = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    return valor.replace(/[&<>"']/g, caracter => reemplazos[caracter]);
}

function capitalizar(texto) {
    return String(texto ?? "").charAt(0).toUpperCase() + String(texto ?? "").slice(1);
}

function normalizarRespuesta(valor) {
    return String(valor ?? "").trim().toLowerCase();
}

function normalizarCategoria(valor) {
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function coincideCategoria(categoriaPregunta, tecnologiaSeleccionada) {
    const categoria = normalizarCategoria(categoriaPregunta);
    const tecnologia = normalizarCategoria(tecnologiaSeleccionada);

    const aliasCategorias = {
        logica: ["logica", "logica de programacion"],
        html: ["html"],
        python: ["python"],
        java: ["java"],
        sql: ["sql"],
        git: ["git", "control de versiones"]
    };

    const equivalentes = aliasCategorias[tecnologia] || [tecnologia];
    return equivalentes.includes(categoria);
}

function aplanarPreguntas(data) {
    return data.flatMap(item => Array.isArray(item) ? aplanarPreguntas(item) : [item]);
}

function validarPreguntas(preguntasCargadas, archivo) {
    const tiposSoportados = new Set(["multiple", "codigo", "analizar-salida", "debug", "consulta", "comando"]);
    const preguntasValidas = [];

    preguntasCargadas.forEach((pregunta, indice) => {
        if (!pregunta || typeof pregunta !== "object") {
            console.warn(`[${archivo}] Pregunta inválida en la posición ${indice}.`);
            return;
        }

        if (!pregunta.id || !pregunta.categoria || !pregunta.tipo) {
            console.warn(`[${archivo}] Pregunta incompleta:`, pregunta);
            return;
        }

        if (!tiposSoportados.has(pregunta.tipo)) {
            console.warn(`[${archivo}] Tipo no soportado "${pregunta.tipo}" en`, pregunta.id);
            return;
        }

        preguntasValidas.push(pregunta);
    });

    return preguntasValidas;
}

function esPreguntaDeOpciones(pregunta) {
    return ["multiple", "analizar-salida", "debug", "consulta", "comando"].includes(pregunta?.tipo)
        && Array.isArray(pregunta?.opciones);
}

function limpiarTemporizador() {
    if (temporizador) {
        clearInterval(temporizador);
        temporizador = null;
    }
}

function recalcularResumen() {
    puntajeTotal = estadoPreguntas
        .filter(estado => estado?.esCorrecta)
        .reduce((total, estado) => total + (Number(estado.puntos) || 0), 0);

    respuestasCorrectas = estadoPreguntas.filter(estado => estado?.esCorrecta).length;
}

function obtenerEstadoPregunta(indice) {
    if (!estadoPreguntas[indice]) {
        const pregunta = preguntasFiltradas[indice];

        estadoPreguntas[indice] = {
            respuestas: [],
            validada: false,
            esCorrecta: false,
            tiempoAgotado: false,
            puntos: pregunta ? Number(pregunta.puntos) || 0 : 0
        };
    }

    return estadoPreguntas[indice];
}

function actualizarEstado() {
    const total = preguntasFiltradas.length;
    const progreso = total === 0 ? 0 : Math.min((indiceActual / total) * 100, 100);

    estadoTecnologia.textContent = capitalizar(selector.value);
    estadoProgreso.textContent = `${Math.min(indiceActual + 1, total)}/${total}`;
    estadoPuntaje.textContent = String(puntajeTotal);
    estadoTiempo.textContent = segundosRestantes > 0 ? `${segundosRestantes}s` : "--";
    barraProgreso.style.width = `${progreso}%`;
}

function mostrarPanelEstado() {
    panelEstado.classList.remove("oculto");
}

function ocultarPanelEstado() {
    panelEstado.classList.add("oculto");
}

async function cargarPreguntas(archivo) {
    try {
        const respuesta = await fetch(`data/${archivo}.json`);

        if (!respuesta.ok) {
            throw new Error("No fue posible cargar el archivo.");
        }

        const data = await respuesta.json();
        const preguntasPlanas = Array.isArray(data) ? aplanarPreguntas(data) : [];
        preguntas = validarPreguntas(preguntasPlanas, archivo);
    } catch (error) {
        console.error(error);
        preguntas = [];
    }
}

function crearMetaPregunta(pregunta) {
    return `
        <div class="question-meta">
            <span class="meta-pill">Dificultad: ${escaparHtml(pregunta.dificultad)}</span>
            <span class="meta-pill">Puntos: ${escaparHtml(pregunta.puntos)}</span>
            <span class="meta-pill">Tiempo: ${escaparHtml(pregunta.timeLimit)}s</span>
        </div>
    `;
}

function crearOpcionesMultiple(pregunta) {
    const tipoInput = Array.isArray(pregunta.respuesta) ? "checkbox" : "radio";

    return `
        <div class="options-grid">
            ${pregunta.opciones.map((opcion, indice) => {
                const opcionSegura = escaparHtml(opcion);

                return `
                    <label class="option-card" data-option-index="${indice}">
                        <input type="${tipoInput}" name="${pregunta.id}" value="${opcionSegura}">
                        <span>${opcionSegura}</span>
                    </label>
                `;
            }).join("")}
        </div>
    `;
}

function crearBloqueCodigoPregunta(pregunta) {
    if (!pregunta.codigo) {
        return "";
    }

    return `<pre class="code-card">${escaparHtml(pregunta.codigo)}</pre>`;
}

function crearSlotsCodigo(pregunta) {
    const plantillaSegura = escaparHtml(pregunta.plantilla);

    return plantillaSegura.replace(/\{\{slot(\d+)\}\}/g, (_, slotIndex) => {
        const opciones = (pregunta.opcionesSlots || []).map(opcion => {
            const opcionSegura = escaparHtml(opcion);
            return `<option value="${opcionSegura}"></option>`;
        }).join("");

        return `<span class="slot-field">
            <input
                class="slot-input"
                type="text"
                name="${pregunta.id}-slot-${slotIndex}"
                list="${pregunta.id}-slot-list"
                autocomplete="off"
                spellcheck="false"
                placeholder="slot${slotIndex}">
        </span>
        <datalist id="${pregunta.id}-slot-list">
            ${opciones}
        </datalist>`;
    });
}

function restaurarRespuestas(pregunta, estado) {
    if (!estado || !Array.isArray(estado.respuestas)) {
        return;
    }

    if (esPreguntaDeOpciones(pregunta)) {
        contenedor.querySelectorAll(`input[name="${pregunta.id}"]`).forEach(input => {
            input.checked = estado.respuestas.includes(input.value);
        });
    }

    if (pregunta.tipo === "codigo" && pregunta.modo === "slots") {
        estado.respuestas.forEach((valor, indice) => {
            const control = document.querySelector(`input[name="${pregunta.id}-slot-${indice}"]`);

            if (control) {
                control.value = valor;
            }
        });
    }
}

function guardarBorradorPreguntaActual() {
    const pregunta = preguntasFiltradas[indiceActual];
    const estado = obtenerEstadoPregunta(indiceActual);

    if (!pregunta || !estado || estado.validada || estado.tiempoAgotado) {
        return;
    }

    if (esPreguntaDeOpciones(pregunta)) {
        estado.respuestas = Array.from(document.querySelectorAll(`input[name="${pregunta.id}"]:checked`))
            .map(input => input.value);
    }

    if (pregunta.tipo === "codigo" && pregunta.modo === "slots") {
        estado.respuestas = pregunta.respuestasSlots.map((_, indice) => {
            const control = document.querySelector(`input[name="${pregunta.id}-slot-${indice}"]`);
            return control ? control.value.trim() : "";
        });
    }
}

function mostrarResultadoGuardado(pregunta, estado) {
    const resultado = document.getElementById("resultadoRespuesta");

    if (!resultado || !estado || (!estado.validada && !estado.tiempoAgotado)) {
        return;
    }

    if (estado.tiempoAgotado) {
        resultado.innerHTML = `
            <div class="feedback error">
                <strong>Tiempo agotado.</strong>
                <p>La pregunta se cerró automáticamente. Puedes continuar con la navegación.</p>
            </div>
        `;
        return;
    }

    if (esPreguntaDeOpciones(pregunta)) {
        const respuestasCorrectasPregunta = Array.isArray(pregunta.respuesta)
            ? pregunta.respuesta
            : [pregunta.respuesta];

        const clase = estado.esCorrecta ? "success" : "error";
        const titulo = estado.esCorrecta ? "Respuesta correcta." : "Respuesta incorrecta.";
        const explicacion = pregunta.explicacion
            ? `<p>${escaparHtml(pregunta.explicacion)}</p>`
            : "";
        const solucion = estado.esCorrecta
            ? ""
            : `<p>Respuesta esperada: ${respuestasCorrectasPregunta.map(escaparHtml).join(", ")}</p>`;

        resultado.innerHTML = `
            <div class="feedback ${clase}">
                <strong>${titulo}</strong>
                ${solucion}
                ${explicacion}
            </div>
        `;

        marcarOpcionesMultiples(pregunta, estado.respuestas.map(escaparHtml));
        return;
    }

    if (pregunta.tipo === "codigo" && pregunta.modo === "slots") {
        resultado.innerHTML = estado.esCorrecta
            ? `
                <div class="feedback success">
                    <strong>Respuesta correcta.</strong>
                    <p>Completaste el código con los valores esperados.</p>
                </div>
            `
            : `
                <div class="feedback error">
                    <strong>Respuesta incorrecta.</strong>
                    <p>Valores esperados: ${pregunta.respuestasSlots.map(escaparHtml).join(", ")}</p>
                </div>
            `;
    }
}

function renderizarPregunta() {
    limpiarTemporizador();

    const pregunta = preguntasFiltradas[indiceActual];

    if (!pregunta) {
        renderizarResumenFinal();
        return;
    }

    const estado = obtenerEstadoPregunta(indiceActual);
    preguntaRespondida = estado.validada || estado.tiempoAgotado;
    segundosRestantes = Number(pregunta.timeLimit) || 0;
    recalcularResumen();
    actualizarEstado();

    let bloqueRespuesta = `<p>No fue posible renderizar este tipo de pregunta.</p>`;

    if (esPreguntaDeOpciones(pregunta)) {
        bloqueRespuesta = `
            ${crearBloqueCodigoPregunta(pregunta)}
            ${crearOpcionesMultiple(pregunta)}
        `;
    }

    if (pregunta.tipo === "codigo" && pregunta.modo === "slots") {
        bloqueRespuesta = `<pre class="code-card">${crearSlotsCodigo(pregunta)}</pre>`;
    }

    contenedor.innerHTML = `
        <article class="pregunta">
            <div class="question-topbar">
                <span class="question-chip">Pregunta ${indiceActual + 1} de ${preguntasFiltradas.length}</span>
                <span class="question-chip">Tema: ${escaparHtml(capitalizar(selector.value))}</span>
            </div>
            <h2 class="question-title">${escaparHtml(pregunta.pregunta)}</h2>
            ${crearMetaPregunta(pregunta)}
            <p class="question-text">Responde la pregunta y valida tu elección para avanzar.</p>
            ${bloqueRespuesta}
            <div class="question-actions">
                <button type="button" id="atrasPregunta" class="secondary-button">Atrás</button>
                <button type="button" id="saltarPregunta" class="secondary-button">Saltar pregunta</button>
                <button type="button" id="validarRespuesta">Validar respuesta</button>
                <button type="button" id="reiniciarQuiz" class="secondary-button">Cambiar tecnología</button>
            </div>
            <div id="resultadoRespuesta"></div>
            <div id="accionesPregunta" class="question-actions"></div>
        </article>
    `;

    document.getElementById("atrasPregunta").addEventListener("click", irPreguntaAnterior);
    document.getElementById("saltarPregunta").addEventListener("click", saltarPreguntaActual);
    document.getElementById("validarRespuesta").addEventListener("click", validarPreguntaActual);
    document.getElementById("reiniciarQuiz").addEventListener("click", reiniciarVistaInicial);

    if (indiceActual === 0) {
        document.getElementById("atrasPregunta").disabled = true;
    }

    restaurarRespuestas(pregunta, estado);

    if (estado.validada || estado.tiempoAgotado) {
        bloquearControlesPregunta();
        mostrarResultadoGuardado(pregunta, estado);
        mostrarBotonSiguiente();
        actualizarEstado();
        return;
    }

    iniciarTemporizador();
}

function iniciarTemporizador() {
    actualizarEstado();

    if (segundosRestantes <= 0) {
        return;
    }

    temporizador = setInterval(() => {
        segundosRestantes -= 1;
        actualizarEstado();

        if (segundosRestantes > 0) {
            return;
        }

        limpiarTemporizador();

        if (!preguntaRespondida) {
            manejarTiempoAgotado();
        }
    }, 1000);
}

function manejarTiempoAgotado() {
    const resultado = document.getElementById("resultadoRespuesta");
    const estado = obtenerEstadoPregunta(indiceActual);

    if (!resultado) {
        return;
    }

    preguntaRespondida = true;
    estado.validada = false;
    estado.esCorrecta = false;
    estado.tiempoAgotado = true;
    bloquearControlesPregunta();
    resultado.innerHTML = `
        <div class="feedback error">
            <strong>Tiempo agotado.</strong>
            <p>La pregunta se cerró automáticamente. Puedes continuar con la siguiente.</p>
        </div>
    `;

    mostrarBotonSiguiente();
}

function bloquearControlesPregunta() {
    contenedor.querySelectorAll("input, select").forEach(control => {
        control.disabled = true;
    });

    const botonValidar = document.getElementById("validarRespuesta");

    if (botonValidar) {
        botonValidar.disabled = true;
    }

    contenedor.querySelectorAll(".option-card").forEach(card => {
        card.classList.add("disabled");
    });
}

function mostrarBotonSiguiente() {
    const acciones = document.getElementById("accionesPregunta");

    if (!acciones || acciones.querySelector("#siguientePregunta")) {
        return;
    }

    const botonSiguiente = document.createElement("button");
    botonSiguiente.type = "button";
    botonSiguiente.id = "siguientePregunta";
    botonSiguiente.textContent = indiceActual === preguntasFiltradas.length - 1
        ? "Ver resultado final"
        : "Siguiente pregunta";

    botonSiguiente.addEventListener("click", function () {
        indiceActual += 1;
        renderizarPregunta();
    });

    acciones.appendChild(botonSiguiente);
}

function irPreguntaAnterior() {
    guardarBorradorPreguntaActual();

    if (indiceActual === 0) {
        return;
    }

    indiceActual -= 1;
    renderizarPregunta();
}

function saltarPreguntaActual() {
    guardarBorradorPreguntaActual();

    if (indiceActual >= preguntasFiltradas.length - 1) {
        indiceActual += 1;
        renderizarPregunta();
        return;
    }

    indiceActual += 1;
    renderizarPregunta();
}

function marcarOpcionesMultiples(pregunta, seleccionadas) {
    const correctas = Array.isArray(pregunta.respuesta) ? pregunta.respuesta : [pregunta.respuesta];

    contenedor.querySelectorAll(".option-card").forEach(card => {
        const input = card.querySelector("input");

        if (!input) {
            return;
        }

        const valor = input.value;
        const esCorrecta = correctas.includes(valor);
        const fueSeleccionada = seleccionadas.includes(valor);

        if (esCorrecta) {
            card.classList.add("correcta");
        }

        if (fueSeleccionada && !esCorrecta) {
            card.classList.add("incorrecta");
        }
    });
}

function validarPreguntaMultiple(pregunta, resultado) {
    const seleccionadas = Array.from(document.querySelectorAll(`input[name="${pregunta.id}"]:checked`))
        .map(input => input.value);

    if (seleccionadas.length === 0) {
        resultado.innerHTML = `
            <div class="feedback info">
                <p>Selecciona al menos una opción antes de validar.</p>
            </div>
        `;
        return false;
    }

    const respuestasCorrectasPregunta = Array.isArray(pregunta.respuesta)
        ? pregunta.respuesta
        : [pregunta.respuesta];

    const esCorrecta = seleccionadas.length === respuestasCorrectasPregunta.length
        && seleccionadas.every(valor => respuestasCorrectasPregunta.includes(valor));

    if (esCorrecta) {
        puntajeTotal += Number(pregunta.puntos) || 0;
        respuestasCorrectas += 1;
    }

    marcarOpcionesMultiples(pregunta, seleccionadas);

    const clase = esCorrecta ? "success" : "error";
    const titulo = esCorrecta ? "Respuesta correcta." : "Respuesta incorrecta.";
    const explicacion = pregunta.explicacion
        ? `<p>${escaparHtml(pregunta.explicacion)}</p>`
        : "";
    const solucion = esCorrecta
        ? ""
        : `<p>Respuesta esperada: ${respuestasCorrectasPregunta.map(escaparHtml).join(", ")}</p>`;

    resultado.innerHTML = `
        <div class="feedback ${clase}">
            <strong>${titulo}</strong>
            ${solucion}
            ${explicacion}
        </div>
    `;

    return true;
}

function validarPreguntaCodigo(pregunta, resultado) {
    const respuestasUsuario = pregunta.respuestasSlots.map((_, indice) => {
        const control = document.querySelector(`input[name="${pregunta.id}-slot-${indice}"]`);
        return control ? control.value.trim() : "";
    });

    if (respuestasUsuario.some(valor => valor === "")) {
        resultado.innerHTML = `
            <div class="feedback info">
                <p>Completa todos los espacios antes de validar.</p>
            </div>
        `;
        return false;
    }

    const esCorrecta = respuestasUsuario.every((valor, indice) =>
        normalizarRespuesta(valor) === normalizarRespuesta(pregunta.respuestasSlots[indice])
    );

    if (esCorrecta) {
        puntajeTotal += Number(pregunta.puntos) || 0;
        respuestasCorrectas += 1;
    }

    resultado.innerHTML = esCorrecta
        ? `
            <div class="feedback success">
                <strong>Respuesta correcta.</strong>
                <p>Completaste el código con los valores esperados.</p>
            </div>
        `
        : `
            <div class="feedback error">
                <strong>Respuesta incorrecta.</strong>
                <p>Valores esperados: ${pregunta.respuestasSlots.map(escaparHtml).join(", ")}</p>
            </div>
        `;

    return true;
}

function validarPreguntaActual() {
    const pregunta = preguntasFiltradas[indiceActual];
    const resultado = document.getElementById("resultadoRespuesta");
    const estado = obtenerEstadoPregunta(indiceActual);

    if (!pregunta || !resultado || preguntaRespondida) {
        return;
    }

    let respondida = false;

    if (esPreguntaDeOpciones(pregunta)) {
        respondida = validarPreguntaMultiple(pregunta, resultado);
    }

    if (pregunta.tipo === "codigo" && pregunta.modo === "slots") {
        respondida = validarPreguntaCodigo(pregunta, resultado);
    }

    if (!respondida) {
        return;
    }

    if (esPreguntaDeOpciones(pregunta)) {
        estado.respuestas = Array.from(document.querySelectorAll(`input[name="${pregunta.id}"]:checked`))
            .map(input => input.value);
    }

    if (pregunta.tipo === "codigo" && pregunta.modo === "slots") {
        estado.respuestas = pregunta.respuestasSlots.map((_, indice) => {
            const control = document.querySelector(`input[name="${pregunta.id}-slot-${indice}"]`);
            return control ? control.value.trim() : "";
        });
    }

    estado.validada = true;
    estado.tiempoAgotado = false;
    estado.esCorrecta = resultado.querySelector(".feedback.success") !== null;

    preguntaRespondida = true;
    limpiarTemporizador();
    bloquearControlesPregunta();
    recalcularResumen();
    actualizarEstado();
    mostrarBotonSiguiente();
}

function renderizarResumenFinal() {
    limpiarTemporizador();
    estadoProgreso.textContent = `${preguntasFiltradas.length}/${preguntasFiltradas.length}`;
    estadoTiempo.textContent = "--";
    barraProgreso.style.width = "100%";

    const totalPreguntas = preguntasFiltradas.length;
    const preguntasIncorrectas = totalPreguntas - respuestasCorrectas;
    const porcentaje = totalPreguntas === 0 ? 0 : Math.round((respuestasCorrectas / totalPreguntas) * 100);

    contenedor.innerHTML = `
        <section class="summary-card">
            <span class="question-chip">Resultado final</span>
            <h2 class="question-title">Terminaste el simulacro de ${escaparHtml(capitalizar(selector.value))}</h2>
            <p class="question-text">
                Aquí tienes un resumen rápido de tu desempeño para esta ronda.
            </p>
            <div class="summary-grid">
                <div class="summary-box">
                    <span>Aciertos</span>
                    <strong>${respuestasCorrectas}</strong>
                </div>
                <div class="summary-box">
                    <span>Incorrectas</span>
                    <strong>${preguntasIncorrectas}</strong>
                </div>
                <div class="summary-box">
                    <span>Puntaje final</span>
                    <strong>${puntajeTotal}</strong>
                </div>
            </div>
            <div class="feedback info">
                <p>Porcentaje de acierto: ${porcentaje}%.</p>
            </div>
            <div class="question-actions">
                <button type="button" id="reintentarQuiz">Intentar de nuevo</button>
                <button type="button" id="cambiarTecnologiaFinal" class="secondary-button">Elegir otra tecnología</button>
            </div>
        </section>
    `;

    document.getElementById("reintentarQuiz").addEventListener("click", function () {
        indiceActual = 0;
        puntajeTotal = 0;
        respuestasCorrectas = 0;
        renderizarPregunta();
    });

    document.getElementById("cambiarTecnologiaFinal").addEventListener("click", reiniciarVistaInicial);
}

function mostrarEstadoSinContenido(mensaje) {
    limpiarTemporizador();
    ocultarPanelEstado();
    contenedor.innerHTML = `
        <div class="empty-state">
            <h2>${escaparHtml(capitalizar(selector.value))}</h2>
            <p>${escaparHtml(mensaje)}</p>
        </div>
    `;
}

function reiniciarVistaInicial() {
    limpiarTemporizador();
    preguntas = [];
    preguntasFiltradas = [];
    indiceActual = 0;
    puntajeTotal = 0;
    respuestasCorrectas = 0;
    segundosRestantes = 0;
    preguntaRespondida = false;
    estadoPreguntas = [];
    ocultarPanelEstado();

    contenedor.innerHTML = `
        <div class="empty-state">
            <h2>Selecciona una tecnología</h2>
            <p>
                Elige un tema y comienza a responder preguntas. Cuando un archivo no
                tenga contenido, te mostraremos un estado claro para que puedas
                completarlo después.
            </p>
        </div>
    `;
}

form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const tecnologia = selector.value;

    preguntas = [];
    preguntasFiltradas = [];
    indiceActual = 0;
    puntajeTotal = 0;
    respuestasCorrectas = 0;
    preguntaRespondida = false;
    estadoPreguntas = [];

    await cargarPreguntas(tecnologia);

    preguntasFiltradas = preguntas.filter(p =>
        coincideCategoria(p.categoria, tecnologia)
    );

    if (preguntasFiltradas.length === 0) {
        mostrarEstadoSinContenido("Esta tecnología todavía no tiene preguntas cargadas en su archivo JSON.");
        return;
    }

    mostrarPanelEstado();
    estadoPreguntas = preguntasFiltradas.map(pregunta => ({
        respuestas: [],
        validada: false,
        esCorrecta: false,
        tiempoAgotado: false,
        puntos: Number(pregunta.puntos) || 0
    }));
    renderizarPregunta();
});
