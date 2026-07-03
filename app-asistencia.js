// ConfiguraciÃ³n de Firebase (Usa las mismas de tu catÃ¡logo)
const firebaseConfig = {
  apiKey: "AIzaSyCkc78g60mGIM6E6y-6muW7icx99tzW4Fk",
  authDomain: "asistencia-cttc-senati.firebaseapp.com",
  projectId: "asistencia-cttc-senati",
  storageBucket: "asistencia-cttc-senati.firebasestorage.app",
  messagingSenderId: "91519430062",
  appId: "1:91519430062:web:bfa3f681912fd283832c3f"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ConfiguraciÃ³n de la segunda base de datos (Programaciones CTTC)
const firebaseProgramacionConfig = {
  apiKey: "AIzaSyB38Wbf0Q9YLz61vxQXVw1oSpMNyPVGy-c",
  authDomain: "programacion-cttc.firebaseapp.com",
  projectId: "programacion-cttc",
  storageBucket: "programacion-cttc.firebasestorage.app",
  messagingSenderId: "2776502914",
  appId: "1:2776502914:web:6389898d92d7c4b5ba1a9b"
};
const appProgramacion = firebase.initializeApp(firebaseProgramacionConfig, "AppProgramaciones");
const dbProgramacion = appProgramacion.firestore();

let timerInterval;
let startTime;
let currentAsistenciaId;
let datosCierreMes = []; // Variable global para guardar el último reporte generado
let adminVerTodos = false; // Estado para limitar la vista de reportes en admin
let unsubscribePlanillas = null;
let unsubscribeEstadoFirmas = null;
let unsubscribeFirmasPendientes = null;
let unsubscribeDocentePlanillas = null;
window.adminSortConfig = {
    field: 'fecha',
    direction: 'desc'
};

// Capturar parÃ¡metros de la URL enviados desde el CatÃ¡logo
const params = new URLSearchParams(window.location.search);
const docenteNombre = params.get('name');
const docenteUID = params.get('uid');
const docenteDNI = params.get('dni');
const docenteID = params.get('id');
const docenteRol = params.get('rol');

// Verifica en consola si los datos llegan al cargar la pÃ¡gina
console.log("Datos recibidos:", { docenteUID, docenteNombre, docenteDNI, docenteID, docenteRol });



// 1. RECUPERACIÃ“N AUTOMÃTICA AL CARGAR LA PÃGINA
document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('welcome-msg')) {
        const welcomeMsg = document.getElementById('welcome-msg');
        welcomeMsg.innerText = `Hola, ${docenteNombre || 'Docente'}`;
        
        // Inyectar el botÃ³n de "Mis Registros" dinÃ¡micamente debajo del nombre
        if (!document.getElementById('btn-mis-registros')) {
            welcomeMsg.insertAdjacentHTML('afterend', `
                <div class="mt-2 mb-3">
                    <button id="btn-mis-registros" class="btn btn-success btn-sm rounded-pill fw-bold shadow-sm" onclick="verMisRegistros()">
                        <i class="bi bi-clock-history"></i> Mis Registros
                    </button>
                    <button id="btn-mis-planillas" class="btn btn-outline-primary btn-sm rounded-pill fw-bold shadow-sm ms-2" onclick="verMisPlanillas()">
                        <i class="bi bi-file-earmark-text"></i> Mis Planillas
                    </button>
                </div>
            `);
        }
    }
    if (document.getElementById('display-dni')) {
        document.getElementById('display-dni').innerText = docenteDNI || 'S/N';
    }
    if (document.getElementById('display-id')) {
        document.getElementById('display-id').innerText = docenteID || 'S/N';
    }
    if (document.getElementById('display-uid')) {
        document.getElementById('display-uid').innerText = docenteUID || 'S/N';
        // Ocultar el elemento padre para que no se vea el UID ni su etiqueta visualmente
        document.getElementById('display-uid').parentElement.style.display = 'none';
    }

    if (docenteDNI) {
        verificarFirmasPendientes();
    }

    // --- NUEVO: LÃ­mite de palabras para Actividad/Tema ---
    const temaInput = document.getElementById('tema-input');
    if (temaInput) {
        const feedback = document.createElement('small');
        feedback.id = 'tema-feedback';
        feedback.className = 'text-muted d-block mt-1';
        feedback.innerText = '0/15 palabras';
        temaInput.insertAdjacentElement('afterend', feedback);

        temaInput.addEventListener('input', function() {
            const maxWords = 15;
            let text = this.value;
            let words = text.trim() === "" ? [] : text.trim().split(/\s+/);
            
            if (words.length > maxWords) {
                this.value = words.slice(0, maxWords).join(" ") + " ";
                feedback.className = 'text-danger d-block mt-1 fw-bold';
                feedback.innerText = `LÃ­mite alcanzado: ${maxWords}/${maxWords} palabras.`;
            } else {
                feedback.className = 'text-muted d-block mt-1';
                feedback.innerText = `${words.length}/${maxWords} palabras.`;
            }
        });
    }

    if (!docenteUID) return;

    try {
        const snapshot = await db.collection('asistencias')
            .where("uid", "==", docenteUID)
            .where("estado", "==", "activo")
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const docActivo = snapshot.docs[0];
            const data = docActivo.data();
            const idDoc = docActivo.id;
            
            // 1. Calcular tiempo transcurrido
            const ahora = new Date();
            const inicio = data.inicio.toDate();
            const diferenciaHoras = (ahora - inicio) / (1000 * 60 * 60);

            // 2. APLICAR REGLA DE LAS 8 HORAS
            if (diferenciaHoras >= 8) {
                console.log("SesiÃ³n excediÃ³ las 8 horas. Finalizando automÃ¡ticamente...");
                
                await db.collection('asistencias').doc(idDoc).update({
                    fin: firebase.firestore.FieldValue.serverTimestamp(),
                    horasTotales: 8.00, // Se castiga o limita a 8 horas
                    estado: "finalizado_auto",
                    comentarios: (data.comentarios || "") + " [CIERRE AUTOMÃTICO POR EXCESO DE TIEMPO]"
                });

                localStorage.removeItem('sesion_startTime');
                alert("TenÃ­as una sesiÃ³n abierta de hace mÃ¡s de 8 horas. Se ha cerrado automÃ¡ticamente con el lÃ­mite de tiempo permitido.");
                location.reload();
                return;
            }

            // 3. Si es menor a 8 horas, recuperar normalmente
            currentAsistenciaId = idDoc;
            
            // Recuperar el startTime exacto de localStorage para que no se reinicie el cronÃ³metro
            const savedTime = localStorage.getItem('sesion_startTime');
            if (savedTime) {
                startTime = new Date(savedTime);
            } else {
                startTime = inicio;
                localStorage.setItem('sesion_startTime', startTime.toISOString());
            }
            
            document.getElementById('start-zone').style.display = 'none';
            document.getElementById('end-zone').style.display = 'block';
            iniciarCronometro();
            
            // Aviso visual de sincronizaciÃ³n
            const timerDisplay = document.getElementById('timer-display');
            timerDisplay.classList.add('text-success');
            console.log("SesiÃ³n sincronizada desde la nube.");
        }
    } catch (error) {
        console.error("Error en la sincronizaciÃ³n:", error);
    }
});



// FUNCIONES DE MARCACIÃ“N
// 2. INICIO DE JORNADA (No cambia mucho, pero Firebase ya guarda el 'inicio')
async function startSession() {
    if (!docenteUID) return alert("Error: Identidad no detectada.");
    
    startTime = new Date();
    localStorage.setItem('sesion_startTime', startTime.toISOString());
    const nuevaAsistencia = {
        uid: docenteUID,
        nombre: docenteNombre,
        dni: docenteDNI || "",
        id_docente: docenteID || "",
        rol: docenteRol || "Docente",
        inicio: firebase.firestore.FieldValue.serverTimestamp(),
        estado: "activo",
        nombreCurso: "",
        nrc: "",
        temaDictado: ""
    };

    try {
        const docRef = await db.collection('asistencias').add(nuevaAsistencia);
        currentAsistenciaId = docRef.id;
        
        document.getElementById('start-zone').style.display = 'none';
        document.getElementById('end-zone').style.display = 'block';
        
        iniciarCronometro();
    } catch (e) { 
        console.error("Error al iniciar:", e);
        alert("No se pudo iniciar la jornada.");
    }
}

let nrcTimeout;

// Lista editable de feriados (YYYY-MM-DD). Añadir aquí las fechas de feriados nacionales/locales.
const FERiados = [
    // Ejemplo: '2026-05-01', '2026-07-29'
];

// FunciÃ³n para limpiar los placeholders de sesiÃ³n y tema
function resetSessionPlaceholders() {
    const sesionInput = document.getElementById('sesion-input');
    const temaInput = document.getElementById('tema-input');
    if (sesionInput) {
        sesionInput.placeholder = "Ej: 1";
        sesionInput.title = "";
    }
    if (temaInput) {
        temaInput.placeholder = "Ej: IntroducciÃ³n a la seguridad...";
        temaInput.title = "";
    }
}

// Genera reporte por docente: totales por día, totales por semana e indicador de trabajo en feriado
function generarReporteDocente() {
    const datos = window.filteredAsistencias || [];
    if (!datos.length) {
        alert('No hay registros en el rango filtrado. Asegúrate de aplicar el rango de fechas.');
        return;
    }

    // Agregar estructura por docente
    const resumen = {}; // key -> { id, nombre, dni, dias: {date: hours}, semanas: {weekStart: hours}, trabajoFeriado: bool }

    datos.forEach(entry => {
        const a = entry.data;
        const fechaObj = entry.fechaObj || (a.inicio ? a.inicio.toDate() : null);
        if (!fechaObj) return;

        const fechaStr = fechaObj.getFullYear() + '-' + String(fechaObj.getMonth()+1).padStart(2,'0') + '-' + String(fechaObj.getDate()).padStart(2,'0');

        // calcular inicio de semana (lunes)
        const day = fechaObj.getDay(); // 0 dom .. 6 sab
        const diffToMonday = (day + 6) % 7; 
        const monday = new Date(fechaObj);
        monday.setDate(fechaObj.getDate() - diffToMonday);
        const weekStart = monday.getFullYear() + '-' + String(monday.getMonth()+1).padStart(2,'0') + '-' + String(monday.getDate()).padStart(2,'0');

        const docenteKey = (a.id_docente || a.uid || entry.id) + '||' + (a.nombre || 'Sin nombre');
        if (!resumen[docenteKey]) {
            resumen[docenteKey] = { id: a.id_docente || a.uid || entry.id, nombre: a.nombre || 'Sin nombre', dni: a.dni || '', dias: {}, semanas: {}, trabajoFeriado: false };
        }

        const horas = Number(a.horasTotales) || 0;
        resumen[docenteKey].dias[fechaStr] = (resumen[docenteKey].dias[fechaStr] || 0) + horas;
        resumen[docenteKey].semanas[weekStart] = (resumen[docenteKey].semanas[weekStart] || 0) + horas;

        // Detectar feriado: o bien la entrada contiene un flag, o la fecha está en la lista FERiados
        if (a.feriado === true || a.esFeriado === true || a.isHoliday === true) resumen[docenteKey].trabajoFeriado = true;
        if (FERiados.includes(fechaStr)) resumen[docenteKey].trabajoFeriado = true;
    });

    // Generar HTML
    let html = '';
    html += '<div class="table-responsive">';
    html += '<table class="table table-sm table-striped">';
    html += '<thead class="table-light"><tr><th>Docente</th><th>DNI</th><th>Totales por Día</th><th>Totales por Semana (Inicio)</th><th>Trabajó en Feriado</th></tr></thead>';
    html += '<tbody>';
    html += '<tr><td colspan="5" class="text-danger small"><strong>Nota:</strong> las filas de día en rojo indican días con más de 4 horas.</td></tr>';

    Object.values(resumen).forEach(r => {
        // construir mini tabla de dias
        let diasHtml = '<table class="table table-borderless mb-0 small">';
        Object.keys(r.dias).sort().forEach(d => {
            const horasDia = r.dias[d];
            const claseAlerta = horasDia > 4 ? 'table-danger' : '';
            diasHtml += `<tr class="${claseAlerta}"><td>${d}</td><td class="text-end fw-bold">${horasDia.toFixed(2)}</td></tr>`;
        });
        diasHtml += '</table>';

        let semanasHtml = '<table class="table table-borderless mb-0 small">';
        Object.keys(r.semanas).sort().forEach(w => {
            semanasHtml += `<tr><td>${w}</td><td class="text-end">${r.semanas[w].toFixed(2)}</td></tr>`;
        });
        semanasHtml += '</table>';

        html += `<tr>
            <td>${r.nombre}</td>
            <td>${r.dni}</td>
            <td style="min-width:200px">${diasHtml}</td>
            <td style="min-width:200px">${semanasHtml}</td>
            <td>${r.trabajoFeriado ? '<span class="badge bg-danger">Sí</span>' : '<span class="badge bg-secondary">No</span>'}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';

    document.getElementById('contenido-reporte-docente').innerHTML = html;

    // Guardar datos para exportar si es necesario
    window._ultimoReporteDocente = resumen;

    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalReporteDocente'));
    modal.show();
}

// Exportar reporte docente a Excel (CSV simple)
function exportarReporteDocenteExcel() {
    const resumen = window._ultimoReporteDocente || {};
    const rows = [];
    rows.push(['Docente','DNI','Tipo','Fecha/InicioSemana','Horas']);
    Object.values(resumen).forEach(r => {
        Object.entries(r.dias).forEach(([d,h]) => { rows.push([r.nombre, r.dni, 'Día', d, h.toFixed(2)]) });
        Object.entries(r.semanas).forEach(([w,h]) => { rows.push([r.nombre, r.dni, 'Semana', w, h.toFixed(2)]) });
        if (r.trabajoFeriado) rows.push([r.nombre, r.dni, 'Feriado', 'Trabajó en feriado', 'Sí']);
    });

    const csv = '\ufeff' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_docente_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

async function buscarInfoNRC() {
    const nrcInput = document.getElementById('nrc-input');
    const cursoInput = document.getElementById('curso-input');
    const loadingText = document.getElementById('nrc-loading');
    const infoCard = document.getElementById('nrc-info-card');
    
    let nrcValue = nrcInput.value;
    nrcValue = nrcValue ? nrcValue.toString().trim() : '';
    
    // Filtrar para que solo acepte caracteres numÃ©ricos en caso de copiar y pegar
    if (/[^0-9]/.test(nrcValue)) {
        nrcValue = nrcValue.replace(/[^0-9]/g, '');
        nrcInput.value = nrcValue;
    }

    if (!nrcValue) {
        infoCard.style.display = 'none';
        cursoInput.value = '';
        loadingText.style.display = 'none';
        resetSessionPlaceholders();
        return;
    }

    // Usamos debounce para no saturar Firebase con peticiones por cada tecla pulsada
    clearTimeout(nrcTimeout);
    nrcTimeout = setTimeout(async () => {
        loadingText.style.display = 'block';
        loadingText.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Buscando...';
        loadingText.className = "form-text text-primary small mt-1";
        infoCard.style.display = 'none';
        
        try {
            // Intentar buscar el NRC asumiendo que se guardÃ³ como Texto
            let snapshot = await dbProgramacion.collection('programaciones').where('NRC', '==', nrcValue).limit(1).get();
            
            // Si no lo encuentra, intentar buscarlo asumiendo que se guardÃ³ como NÃºmero
            if (snapshot.empty) {
                snapshot = await dbProgramacion.collection('programaciones').where('NRC', '==', Number(nrcValue)).limit(1).get();
            }

            // Si aÃºn no lo encuentra, intentar con la propiedad en minÃºscula "nrc" (Texto y NÃºmero)
            if (snapshot.empty) {
                snapshot = await dbProgramacion.collection('programaciones').where('nrc', '==', nrcValue).limit(1).get();
            }
            if (snapshot.empty) {
                snapshot = await dbProgramacion.collection('programaciones').where('nrc', '==', Number(nrcValue)).limit(1).get();
            }

            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                console.log("âœ… NRC Encontrado en Firebase:", data); // Ayuda para depurar en consola
                // FunciÃ³n auxiliar para extraer el campo ignorando mayÃºsculas/minÃºsculas o espacios accidentales
                const getField = (obj, propName) => {
                    const key = Object.keys(obj).find(k => k.trim().toLowerCase() === propName.trim().toLowerCase());
                    return key ? obj[key] : null;
                };
                
                cursoInput.value = getField(data, 'MODULO-CURSO') || getField(data, 'CURSO') || '';
                document.getElementById('nrc-horario').innerText = getField(data, 'Horario') || '---';
                document.getElementById('nrc-duracion').innerText = getField(data, 'DuraciÃ³n') || getField(data, 'Duracion') || '---';
                document.getElementById('nrc-inicio').innerText = getField(data, 'Fecha de inicio') || getField(data, 'Inicio') || '---';
                document.getElementById('nrc-fin').innerText = getField(data, 'Fecha de fin') || getField(data, 'Fin') || '---';
                
                infoCard.style.display = 'block';
                loadingText.style.display = 'none';

                // --- INICIO: LÃ³gica para sugerir siguiente sesiÃ³n y tema ---
                try {
                    const asistenciasSnap = await db.collection('asistencias')
                        .where('nrc', '==', nrcValue)
                        .get();

                    const sesionInput = document.getElementById('sesion-input');
                    const temaInput = document.getElementById('tema-input');

                    if (sesionInput && temaInput) { // Solo proceder si los campos existen
                        let registros = [];
                        asistenciasSnap.forEach(doc => {
                            const d = doc.data();
                            if (d.estado === 'finalizado' || d.estado === 'finalizado_auto') {
                                registros.push(d);
                            }
                        });

                        if (registros.length > 0) {
                            // Ordenar descendentemente por fecha para obtener el Ãºltimo
                            registros.sort((a, b) => {
                                const dateA = a.inicio ? a.inicio.toDate() : new Date(0);
                                const dateB = b.inicio ? b.inicio.toDate() : new Date(0);
                                return dateB - dateA;
                            });

                            const lastAsistencia = registros[0];
                            const lastSesion = lastAsistencia.numeroSesion || '';
                            const lastTema = lastAsistencia.temaDictado || '';

                            if (lastSesion) {
                                sesionInput.placeholder = `Ultimo registro: ${lastSesion}`;
                                sesionInput.title = `La Ãºltima sesiÃ³n registrada fue: ${lastSesion}`;
                            } else {
                                sesionInput.placeholder = "Ej: 1";
                            }
                            
                            if (lastTema) {
                                temaInput.placeholder = `Ãšltimo tema: ${lastTema}`;
                                temaInput.title = `Ãšltimo tema: ${lastTema}`;
                            } else {
                                temaInput.placeholder = "Ej: IntroducciÃ³n a la seguridad...";
                            }
                        } else {
                            // No hay registros previos para este NRC
                            sesionInput.placeholder = "Ej: 1 (Primer registro)";
                            sesionInput.title = "Primer registro para este NRC";
                            temaInput.placeholder = "Ej: IntroducciÃ³n a la seguridad...";
                        }
                    }
                } catch (err) {
                    console.warn("No se pudo buscar la Ãºltima sesiÃ³n para sugerencias:", err);
                }
                // --- FIN: LÃ³gica para sugerir siguiente sesiÃ³n y tema ---
            } else {
                console.warn("âš ï¸ NRC no encontrado en la base de datos.");
                cursoInput.value = '';
                infoCard.style.display = 'none';
                
                loadingText.style.display = 'block';
                loadingText.innerHTML = '<i class="bi bi-exclamation-circle"></i> NRC no encontrado';
                loadingText.className = "form-text text-danger small mt-1";
                resetSessionPlaceholders();
            }
        } catch (error) {
            console.error("Error al buscar informaciÃ³n del NRC:", error);
            loadingText.style.display = 'block';
            loadingText.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Error: ${error.message || 'Fallo de conexiÃ³n'}`;
            loadingText.className = "form-text text-danger small mt-1";
            resetSessionPlaceholders();
        }
    }, 800); // 800 milisegundos de espera tras la Ãºltima pulsaciÃ³n
}

async function endSession() {
    // 1. VerificaciÃ³n de seguridad de la sesiÃ³n
    if (!currentAsistenciaId) {
        return alert("Error: No se encontrÃ³ una sesiÃ³n activa. Por favor, recarga la pÃ¡gina.");
    }

    // Captura de campos obligatorios
    const cursoInput = document.getElementById('curso-input');
    const nrcInput = document.getElementById('nrc-input');
    const temaInput = document.getElementById('tema-input');

    if (!cursoInput || !nrcInput || !temaInput) {
        return alert("Error tÃ©cnico: No se encuentran los campos en el HTML. Por favor, limpia la cachÃ© (Ctrl+F5).");
    }

    const curso = cursoInput.value.trim();
    const nrc = nrcInput.value.trim();
    const tema = temaInput.value.trim();

    if (!curso || !nrc || !tema) {
        return alert("âš ï¸ Por favor, complete los campos obligatorios (Curso, NRC y Tema) antes de finalizar.");
    }

    // Validar cantidad de palabras en el tema como medida de seguridad
    const temaWords = tema.split(/\s+/).filter(w => w.length > 0);
    if (temaWords.length > 15) {
        return alert("âš ï¸ El tema dictado es muy extenso. Por favor, resÃºmalo a un mÃ¡ximo de 15 palabras.");
    }

    // 2. Deshabilitar el botÃ³n para evitar el "Doble Clic"
    const btnFinalizar = document.querySelector('#end-zone .btn-danger');
    if (btnFinalizar) {
        btnFinalizar.disabled = true;
        btnFinalizar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    }

    // 3. CÃ¡lculo seguro de las horas
    let horasCalculadas = 0;
    if (startTime) {
        const endTime = new Date();
        const diffHrs = ((endTime - startTime) / (1000 * 60 * 60)).toFixed(2);
        horasCalculadas = parseFloat(diffHrs) || 0;
    }

    const datosRegistro = {
        fin: firebase.firestore.FieldValue.serverTimestamp(),
        horasTotales: horasCalculadas,
        nombreCurso: curso,
        nrc: nrc,
        numeroSesion: document.getElementById('sesion-input')?.value || "",
        modalidad: document.getElementById('modalidad-input')?.value || "Presencial",
        temaDictado: tema,
        comentarios: document.getElementById('comentarios-input')?.value || "",
        checklist: {
            planSesion: document.getElementById('chk-plan')?.checked || false,
            asistenciaBB: document.getElementById('chk-asistencia')?.checked || false,
            fechasBB: document.getElementById('chk-fechas')?.checked || false,
            objetivosSesion: document.getElementById('chk-objetivos')?.checked || false,
            grabacionSesion: document.getElementById('chk-grabacion')?.checked || false,
            retroalimentacionBB: document.getElementById('chk-retro')?.checked || false
        },
        estado: "finalizado"
    };

    try {
        await db.collection('asistencias').doc(currentAsistenciaId).update(datosRegistro);
        
        clearInterval(timerInterval);
        localStorage.removeItem('sesion_startTime');
        alert("âœ… Jornada guardada y sincronizada exitosamente.");
        location.reload(); 
    } catch (error) {
        console.error("Error al finalizar:", error);
        alert("âŒ Error al finalizar la sesiÃ³n. Verifique su conexiÃ³n.");
        
        // Si ocurre un error, volvemos a habilitar el botÃ³n para reintentar
        if (btnFinalizar) {
            btnFinalizar.disabled = false;
            btnFinalizar.innerHTML = '<i class="bi bi-stop-circle-fill"></i> FINALIZAR Y REGISTRAR';
        }
    }
}

function iniciarCronometro() {
    timerInterval = setInterval(() => {
        const ahora = new Date();
        const diff = new Date(ahora - startTime);
        const hrs = String(diff.getUTCHours()).padStart(2, '0');
        const min = String(diff.getUTCMinutes()).padStart(2, '0');
        const sec = String(diff.getUTCSeconds()).padStart(2, '0');
        document.getElementById('timer-display').innerText = `${hrs}:${min}:${sec}`;
    }, 1000);
}

// --- 3. FUNCIONES DEL DOCENTE (VER Y DESCARGAR REGISTROS) ---
async function verMisRegistros() {
    if (!docenteUID) return alert("Error: Identidad no detectada.");

    // Crear el modal dinÃ¡micamente si no existe, manteniendo el HTML limpio
    if (!document.getElementById('modalMisRegistros')) {
        const modalHTML = `
        <div class="modal fade" id="modalMisRegistros" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title fw-bold"><i class="bi bi-clock-history"></i> Mi Historial de Asistencias</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Filtros de fecha -->
                        <div class="row g-2 mb-3 bg-light p-2 rounded border shadow-sm">
                            <div class="col-md-5">
                                <label class="form-label small fw-bold mb-0">Desde:</label>
                                <input type="date" id="mis-registros-desde" class="form-control form-control-sm" onchange="verMisRegistros()">
                            </div>
                            <div class="col-md-5">
                                <label class="form-label small fw-bold mb-0">Hasta:</label>
                                <input type="date" id="mis-registros-hasta" class="form-control form-control-sm" onchange="verMisRegistros()">
                            </div>
                            <div class="col-md-2 d-flex align-items-end">
                                <button class="btn btn-sm btn-outline-secondary w-100" onclick="limpiarFiltrosMisRegistros()">Limpiar</button>
                            </div>
                        </div>

                        <!-- Resumen visual -->
                        <div id="resumen-grafico" class="mb-3"></div>
                        
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <span class="text-muted small">Tus Ãºltimos registros</span>
                            <button class="btn btn-sm btn-outline-success fw-bold" onclick="descargarMisRegistros()">
                                <i class="bi bi-download"></i> Descargar CSV
                            </button>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-hover text-center align-middle" style="font-size: 0.9rem;">
                                <thead class="table-light">
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Curso / NRC</th>
                                        <th>Tema Dictado</th>
                                        <th>Horas</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody id="tabla-mis-registros">
                                    <tr><td colspan="5" class="py-3">Cargando registros... <span class="spinner-border spinner-border-sm"></span></td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // SoluciÃ³n al bug de mÃºltiples clics en Bootstrap 5
    const modalElement = document.getElementById('modalMisRegistros');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();

    // Resetear visualmente cada vez que se abre
    document.getElementById('tabla-mis-registros').innerHTML = '<tr><td colspan="5" class="py-3">Cargando registros... <span class="spinner-border spinner-border-sm"></span></td></tr>';
    document.getElementById('resumen-grafico').innerHTML = '';

    const filtroDesde = document.getElementById('mis-registros-desde') ? document.getElementById('mis-registros-desde').value : "";
    const filtroHasta = document.getElementById('mis-registros-hasta') ? document.getElementById('mis-registros-hasta').value : "";

    try {
        const snapshot = await db.collection('asistencias').where("uid", "==", docenteUID).get();
        let registros = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Compatibilidad: si el registro es antiguo y no tiene 'estado', validamos si ya tiene hora de 'fin'
            const isFinalizado = data.estado === "finalizado" || data.estado === "finalizado_auto" || data.fin != null;
            
            if (isFinalizado) {
                // Redondear el tiempo trabajado al lÃ­mite inferior de cada media hora (piso) igual que en admin
                data.horasTotales = Math.floor((data.horasTotales || 0) * 2) / 2;
                
                const fechaObj = data.inicio ? data.inicio.toDate() : null;
                const fechaISO = fechaObj ? fechaObj.toISOString().split('T')[0] : '';
                
                let cumpleDesde = filtroDesde ? (fechaISO >= filtroDesde) : true;
                let cumpleHasta = filtroHasta ? (fechaISO <= filtroHasta) : true;
                
                if (cumpleDesde && cumpleHasta) {
                    registros.push(data);
                }
            }
        });

        // Ordenar descendentemente por fecha en memoria
        registros.sort((a, b) => {
            const dateA = a.inicio ? a.inicio.toDate() : new Date(0);
            const dateB = b.inicio ? b.inicio.toDate() : new Date(0);
            return dateB - dateA;
        });

        // Calcular total de horas para el resumen global
        let totalHoras = 0;
        registros.forEach(r => totalHoras += (r.horasTotales || 0));
        
        document.getElementById('resumen-grafico').innerHTML = `
            <div class="alert alert-success d-flex justify-content-between align-items-center py-2 border-0 shadow-sm" style="background-color: #e8f5e9;">
                <div>
                    <h6 class="mb-0 fw-bold text-success"><i class="bi bi-calendar2-check"></i> ${filtroDesde || filtroHasta ? 'Total de Horas (Filtradas)' : 'Total HistÃ³rico de Horas'}</h6>
                </div>
                <h4 class="mb-0 fw-bold text-success">${totalHoras.toFixed(2)} hrs</h4>
            </div>
        `;

        window.misRegistrosData = registros; // Guardar globalmente para la descarga
        const tbody = document.getElementById('tabla-mis-registros');

        if (registros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted py-3">No tienes registros anteriores finalizados.</td></tr>';
            return;
        }

        let html = '';
        // Mostramos todos si hay filtro, sino limitamos a 50 para no sobrecargar el modal
        const limiteMostrar = (filtroDesde || filtroHasta) ? registros.length : 50;
        const registrosMostrar = registros.slice(0, limiteMostrar);

        registrosMostrar.forEach(r => {
            const fecha = r.inicio ? r.inicio.toDate().toLocaleDateString() : '---';
            const horas = r.horasTotales ? r.horasTotales.toFixed(2) : '0.00';
            const estadoBadge = r.estado === 'finalizado_auto' 
                ? '<span class="badge bg-warning text-dark" title="Cierre AutomÃ¡tico (8h)">Auto</span>' 
                : '<span class="badge bg-success">Completado</span>';

            html += `
                <tr>
                    <td class="fw-bold text-nowrap">${fecha}</td>
                    <td><div class="text-truncate" style="max-width: 150px;" title="${r.nombreCurso || ''}">${r.nombreCurso || '---'}</div><small class="text-muted">NRC: ${r.nrc || '---'}</small></td>
                    <td class="text-start"><div class="text-truncate" style="max-width: 200px;" title="${r.temaDictado || ''}">${r.temaDictado || '---'}</div></td>
                    <td class="fw-bold text-primary">${horas}</td>
                    <td>${estadoBadge}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

    } catch (error) {
        console.error("Error al obtener registros:", error);
        document.getElementById('tabla-mis-registros').innerHTML = '<tr><td colspan="5" class="text-danger py-3">Error al cargar los registros. Revisa tu conexiÃ³n a internet.</td></tr>';
    }
}

function limpiarFiltrosMisRegistros() {
    if (document.getElementById('mis-registros-desde')) document.getElementById('mis-registros-desde').value = '';
    if (document.getElementById('mis-registros-hasta')) document.getElementById('mis-registros-hasta').value = '';
    verMisRegistros();
}

async function verMisPlanillas() {
    if (!docenteDNI) return alert("Error: DNI no detectado.");

    if (!document.getElementById('modalMisPlanillas')) {
        const modalHTML = `
        <div class="modal fade" id="modalMisPlanillas" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title fw-bold"><i class="bi bi-file-earmark-text"></i> Mis Planillas</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info mb-3">
                            <strong>Docente:</strong> ${docenteNombre || '---'}<br>
                            <strong>DNI:</strong> ${docenteDNI}
                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-hover align-middle text-center">
                                <thead class="table-light">
                                    <tr>
                                        <th>Periodo</th>
                                        <th>Horas</th>
                                        <th>Estado</th>
                                        <th>Firma Docente</th>
                                        <th>Firma Jefe</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody id="tabla-mis-planillas">
                                    <tr><td colspan="6" class="py-4 text-muted">Buscando planillas...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    const modalElement = document.getElementById('modalMisPlanillas');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();

    if (unsubscribeDocentePlanillas) {
        unsubscribeDocentePlanillas();
        unsubscribeDocentePlanillas = null;
    }

    const normalizedUID = docenteUID?.toString().trim();
    const normalizedDNI = docenteDNI?.toString().trim();
    const normalizedID = docenteID?.toString().trim();
    const numericDNI = normalizedDNI && /^\\d+$/.test(normalizedDNI) ? Number(normalizedDNI) : null;
    const numericID = normalizedID && /^\d+$/.test(normalizedID) ? Number(normalizedID) : null;

    const loadResults = async (queryToUse) => {
        const snapshot = await queryToUse.get();
        const tbody = document.getElementById('tabla-mis-planillas');
        let html = '';
        const docs = [];

        if (snapshot.empty) {
            return false;
        }

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            docs.push({ id: doc.id, ...data });
        });

        window.docentePlanillasData = docs;
        docs.sort((a, b) => {
            const fa = a.fechaCreacion ? a.fechaCreacion.toDate() : new Date(0);
            const fb = b.fechaCreacion ? b.fechaCreacion.toDate() : new Date(0);
            return fb - fa;
        });

        docs.forEach(data => {
            const estado = data.firmaDocente && data.firmaJefe ? '<span class="badge bg-success">Firmado</span>' : '<span class="badge bg-warning text-dark">Pendiente</span>';
            const firmaDocente = data.firmaDocente ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>';
            const firmaJefe = data.firmaJefe ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>';

            html += `
                <tr>
                    <td class="fw-bold">${data.mes || 'Sin periodo'}</td>
                    <td>${Number(data.horasTotales || 0).toFixed(2)}</td>
                    <td>${estado}</td>
                    <td>${firmaDocente}</td>
                    <td>${firmaJefe}</td>
                    <td class="text-nowrap">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="descargarPlanillaDocente('${data.id}')">
                            <i class="bi bi-download"></i> Descargar
                        </button>
                        ${data.firmaDocente ? '' : `<button class="btn btn-sm btn-outline-success" onclick="abrirModalFirmaDocente('${data.id}')">
                            <i class="bi bi-pen-fill"></i> Firmar
                        </button>`}
                    </td>
                </tr>`;
        });

        tbody.innerHTML = html;
        return true;
    };

    let loaded = false;
    console.log('Buscando planillas de docente', { uid: normalizedUID, dni: normalizedDNI, id: normalizedID, numericDNI, numericID });

    if (normalizedUID) {
        loaded = await loadResults(db.collection('firmas_planillas').where('docenteUID', '==', normalizedUID));
    }

    if (!loaded && normalizedDNI) {
        loaded = await loadResults(db.collection('firmas_planillas').where('docenteDni', '==', normalizedDNI));
    }

    if (!loaded && numericDNI !== null) {
        loaded = await loadResults(db.collection('firmas_planillas').where('docenteDni', '==', numericDNI));
    }

    if (!loaded && normalizedID) {
        loaded = await loadResults(db.collection('firmas_planillas').where('docenteId', '==', normalizedID));
    }

    if (!loaded && numericID !== null) {
        loaded = await loadResults(db.collection('firmas_planillas').where('docenteId', '==', numericID));
    }

    if (!loaded && normalizedDNI) {
        loaded = await loadResults(db.collection('firmas_planillas').where('dni', '==', normalizedDNI));
    }

    if (!loaded && numericDNI !== null) {
        loaded = await loadResults(db.collection('firmas_planillas').where('dni', '==', numericDNI));
    }

    if (!loaded && normalizedID) {
        loaded = await loadResults(db.collection('firmas_planillas').where('id_docente', '==', normalizedID));
    }

    if (!loaded && numericID !== null) {
        loaded = await loadResults(db.collection('firmas_planillas').where('id_docente', '==', numericID));
    }

    if (!loaded && normalizedUID) {
        loaded = await loadResults(db.collection('firmas_planillas').where('uid', '==', normalizedUID));
    }

    if (!loaded) {
        const tbody = document.getElementById('tabla-mis-planillas');
        tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-muted">No se encontraron planillas asociadas a tu docente.</td></tr>';
        window.docentePlanillasData = [];
    }
}

function descargarPlanillaDocente(planillaId) {
    if (!window.docentePlanillasData) return alert('No hay planillas cargadas.');
    const planilla = window.docentePlanillasData.find(d => d.id === planillaId);
    if (!planilla) return alert('Planilla no encontrada.');
    generarPDF(planillaId, true);
}

function descargarMisRegistros() {
    if (!window.misRegistrosData || window.misRegistrosData.length === 0) return alert("No hay datos para descargar.");

    let csv = "\ufeffFecha;Curso;NRC;Tema;Horas;Estado\n";
    window.misRegistrosData.forEach(r => {
        const fecha = r.inicio ? r.inicio.toDate().toLocaleDateString() : '---';
        const curso = (r.nombreCurso || '').replace(/"/g, '""');
        const nrc = r.nrc || '';
        const tema = (r.temaDictado || '').replace(/"/g, '""');
        const horas = r.horasTotales ? r.horasTotales.toFixed(2) : '0.00';
        const estado = r.estado === 'finalizado_auto' ? 'Cierre AutomÃ¡tico' : 'Completado';

        csv += `"${fecha}";"${curso}";"${nrc}";"${tema}";"${horas}";"${estado}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Mis_Asistencias_${new Date().toLocaleDateString()}.csv`;
    link.click();
}

// FUNCIONES DE ADMINISTRADOR
function cargarReporteAsistencias() {
    const container = document.getElementById('tabla-reportes-body');
    if (!container) return;

    // 1. Captura de todos los filtros (AsegÃºrate de tener el input 'filtro-nrc' en tu HTML)
    const filtroNombreValue = document.getElementById('filtro-nombre')?.value || "";
    const filtroNombre = filtroNombreValue.toLowerCase();
    const filtroNRCValue = document.getElementById('filtro-nrc')?.value || "";
    const filtroNRC = filtroNRCValue.trim().toLowerCase(); 
    const filtroDniValue = document.getElementById('filtro-dni')?.value || "";
    const filtroDni = filtroDniValue.trim().toLowerCase();
    const filtroIdValue = document.getElementById('filtro-id')?.value || "";
    const filtroId = filtroIdValue.trim().toLowerCase();
    const filtroDesde = document.getElementById('filtro-desde').value;
    const filtroHasta = document.getElementById('filtro-hasta').value;

    // Filtros independientes para la matriz
    const matrizDesde = document.getElementById('matriz-desde')?.value || "";
    const matrizHasta = document.getElementById('matriz-hasta')?.value || "";

    db.collection('asistencias').orderBy('inicio', 'desc').get().then(snapshot => {
        let sumaTotal = 0;
        let sesionesCompletas = 0;
        let sesionesIncompletas = 0;
        
        let registrosMatriz = []; // AlmacenarÃ¡ datos para el cuadro de doble entrada
        window.datosEdicion = {}; // Guardar en memoria local para evitar consultas extra en Firebase
        window.filteredAsistencias = []; // <-- Arreglo para exportaciÃ³n y cierre de mes

        let uniqueNombres = new Set();
        let uniqueNRCs = new Set();
        let uniqueDNIs = new Set();
        let uniqueIDs = new Set();

        // 1. Procesar todos los documentos, filtrar y poblar los arreglos de datos
        snapshot.forEach(doc => {
            const a = doc.data();
            const id = doc.id;

            if (a.estado === "finalizado" || a.estado === "finalizado_auto") {
                // Redondear el tiempo trabajado al lÃ­mite inferior de cada media hora (piso)
                a.horasTotales = Math.floor((a.horasTotales || 0) * 2) / 2;

                const nombreDocente = (a.nombre || '').trim();
                const nrcDocente = a.nrc ? a.nrc.toString().trim() : '';
                const dniDocente = a.dni ? a.dni.toString().trim() : '';
                const idDocente = a.id_docente ? a.id_docente.toString().trim() : '';

                if (nombreDocente) uniqueNombres.add(nombreDocente);
                if (nrcDocente) uniqueNRCs.add(nrcDocente);
                if (dniDocente) uniqueDNIs.add(dniDocente);
                if (idDocente) uniqueIDs.add(idDocente);

                const fechaObj = a.inicio ? a.inicio.toDate() : null;
                // Usar la fecha local (YYYY-MM-DD) para que la comparación con inputs de tipo date sea correcta
                const fechaISO = fechaObj ? (
                    fechaObj.getFullYear() + '-' +
                    String(fechaObj.getMonth() + 1).padStart(2, '0') + '-' +
                    String(fechaObj.getDate()).padStart(2, '0')
                ) : '';
                
                let cumpleNombre = filtroNombre === "" || nombreDocente.toLowerCase() === filtroNombre;
                let cumpleNRC = filtroNRC === "" || (nrcDocente && nrcDocente.toLowerCase() === filtroNRC);
                let cumpleDNI = filtroDni === "" || (dniDocente && dniDocente.toLowerCase() === filtroDni);
                let cumpleID = filtroId === "" || (idDocente && idDocente.toLowerCase() === filtroId);
                let cumpleDesde = filtroDesde ? (fechaISO >= filtroDesde) : true;
                let cumpleHasta = filtroHasta ? (fechaISO <= filtroHasta) : true;

                if (cumpleNombre && cumpleNRC && cumpleDNI && cumpleID && cumpleDesde && cumpleHasta) {
                    sumaTotal += a.horasTotales;
                    
                    const inicioDate = fechaObj;
                    const fechaStrLocal = fechaISO;
                    const inicioIso = inicioDate ? inicioDate.toISOString() : null;
                    const finIso = a.fin ? a.fin.toDate().toISOString() : null;

                    window.datosEdicion[id] = {
                        nombre: a.nombre || '',
                        horas: a.horasTotales,
                        motivo: a.comentariosEdit || '',
                        nrc: a.nrc || '',
                        fecha: fechaStrLocal,
                        inicioTimestamp: inicioIso,
                        finTimestamp: finIso
                    };
                    const checks = a.checklist || {};
                    const totalChecks = Object.values(checks).filter(v => v === true).length;
                    if(totalChecks === 6) sesionesCompletas++; else sesionesIncompletas++;

                    // <-- Guardar registro en la variable global para usarlo en Cierre de Mes y Excel
                    window.filteredAsistencias.push({
                        id: id,
                        data: a,
                        fechaObj: fechaObj,
                        totalChecks: totalChecks
                    });
                }

                // LÃ³gica separada para poblar la matriz con sus propios filtros de fechas
                let cumpleMatrizDesde = matrizDesde ? (fechaISO >= matrizDesde) : true;
                let cumpleMatrizHasta = matrizHasta ? (fechaISO <= matrizHasta) : true;
                
                if (cumpleNombre && cumpleMatrizDesde && cumpleMatrizHasta) {
                    registrosMatriz.push({
                        nombre: a.nombre,
                        uid: a.uid || "S/N",
                        id_docente: a.id_docente || "S/N",
                        dni: a.dni || "S/N",
                        fechaObj: fechaObj,
                        horas: a.horasTotales,
                        modalidad: a.modalidad || "Presencial"
                    });
                }
            }
        });

        // 2. Ordenar y determinar quÃ© registros mostrar
        window.filteredAsistencias = sortAdminAsistencias(window.filteredAsistencias || []);
        updateAdminSortIndicators();
        const totalFiltrado = window.filteredAsistencias.length;
        const registrosParaMostrar = adminVerTodos ? window.filteredAsistencias : window.filteredAsistencias.slice(0, 10);
        
        let html = '';
        registrosParaMostrar.forEach(item => {
            const a = item.data;
            const id = item.id;
            const fechaObj = item.fechaObj;
            const totalChecks = item.totalChecks;

            const claseFila = a.estado === "finalizado_auto" ? "table-warning" : "";
            const badgeAlerta = a.estado === "finalizado_auto" ? 
                '<i class="bi bi-exclamation-triangle-fill text-danger" title="Cierre AutomÃ¡tico (8h)"></i>' : "";

            html += `<tr class="${claseFila}">
                <td>${fechaObj ? fechaObj.toLocaleDateString() : '---'}</td>
                <td><strong>${a.nombre}</strong> ${badgeAlerta}</td>
                <td>${a.id_docente || 'S/N'}</td>
                <td>${a.dni || 'S/N'}</td>
                <td>
                    <small class="d-block fw-bold">${a.nombreCurso || 'N/A'}</small>
                    <span class="badge bg-secondary">NRC: ${a.nrc || '---'}</span>
                    ${a.comentariosEdit ? `<div class="text-danger small mt-1" style="font-size:0.75rem"><strong>Ajuste:</strong> ${a.comentariosEdit}</div>` : ''}
                </td>
                <td>${a.numeroSesion || '---'}</td>
                <td>${a.temaDictado || '---'}</td>
                <td class="fw-bold text-primary">${a.horasTotales.toFixed(2)}</td>
                <td>
                    <span class="${totalChecks === 6 ? 'text-success' : 'text-muted'} fw-bold">${totalChecks}/6</span> 
                    <i class="bi bi-patch-check-fill ${totalChecks === 6 ? 'text-success' : 'text-light'}"></i>
                </td>
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-warning" onclick="abrirModalEdicion('${id}')">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarAsistencia('${id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
        });

        container.innerHTML = html;
        document.getElementById('total-horas-acumuladas').innerText = sumaTotal.toFixed(2);
        
        // 3. Actualizar controles de vista y resumen
        const summaryContainer = document.getElementById('report-summary');
        const controlsContainer = document.getElementById('report-view-controls');

        if (summaryContainer && controlsContainer) {
            if (totalFiltrado > 10) {
                if (adminVerTodos) {
                    summaryContainer.innerHTML = `Mostrando <strong>${totalFiltrado}</strong> registros.`;
                    controlsContainer.innerHTML = `<button class="btn btn-sm btn-link" onclick="toggleAdminView()">Ver solo los Ãºltimos 10</button>`;
                } else {
                    summaryContainer.innerHTML = `Mostrando los Ãºltimos <strong>10</strong> de <strong>${totalFiltrado}</strong> registros.`;
                    controlsContainer.innerHTML = `<button class="btn btn-sm btn-link" onclick="toggleAdminView()">Ver todos los registros (${totalFiltrado})</button>`;
                }
            } else {
                summaryContainer.innerHTML = `Mostrando <strong>${totalFiltrado}</strong> registros.`;
                controlsContainer.innerHTML = '';
            }
        }

        // 4. Actualizar el resto de la UI
        actualizarDropdown('filtro-nombre', uniqueNombres, filtroNombreValue);
        actualizarDropdown('filtro-nrc', uniqueNRCs, filtroNRCValue);
        actualizarDropdown('filtro-dni', uniqueDNIs, filtroDniValue);
        actualizarDropdown('filtro-id', uniqueIDs, filtroIdValue);

        if(document.getElementById('total-horas-grande')) {
            document.getElementById('total-horas-grande').innerText = sumaTotal.toFixed(2);
        }
        if(typeof actualizarGrafico === "function") {
            actualizarGrafico(sesionesCompletas, sesionesIncompletas);
        }
        renderizarMatriz(registrosMatriz);
    });
}

function toggleAdminView() {
    adminVerTodos = !adminVerTodos;
    cargarReporteAsistencias();
}

async function obtenerAsistenciasCache(forceRefresh = false) {
    if (!forceRefresh && window.cachedAsistencias) {
        return window.cachedAsistencias;
    }
    const snapshot = await db.collection('asistencias').orderBy('inicio', 'desc').get();
    window.cachedAsistencias = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    return window.cachedAsistencias;
}

function setAdminSort(field) {
    if (window.adminSortConfig.field === field) {
        window.adminSortConfig.direction = window.adminSortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        window.adminSortConfig.field = field;
        window.adminSortConfig.direction = 'asc';
    }
    cargarReporteAsistencias();
}

function getAdminSortValue(item, field) {
    const a = item.data || {};
    switch (field) {
        case 'fecha':
            return item.fechaObj ? item.fechaObj.getTime() : 0;
        case 'docente':
            return (a.nombre || '').toString().toLowerCase();
        case 'id':
            return (a.id_docente || '').toString().toLowerCase();
        case 'dni':
            return (a.dni || '').toString().toLowerCase();
        case 'curso':
            return ((a.nombreCurso || '') + ' ' + (a.nrc || '')).toString().toLowerCase();
        case 'sesion':
            return parseFloat(a.numeroSesion) || a.numeroSesion || '';
        case 'tema':
            return (a.temaDictado || '').toString().toLowerCase();
        case 'horas':
            return parseFloat(a.horasTotales) || 0;
        case 'checks':
            return item.totalChecks || 0;
        case 'acciones':
            return (a.nombre || '').toString().toLowerCase();
        default:
            return '';
    }
}

function updateAdminSortIndicators() {
    const headers = ['fecha', 'docente', 'id', 'dni', 'curso', 'sesion', 'tema', 'horas', 'checks', 'acciones'];
    headers.forEach(field => {
        const indicator = document.getElementById(`sort-${field}`);
        if (!indicator) return;
        if (window.adminSortConfig.field === field) {
            indicator.innerHTML = window.adminSortConfig.direction === 'asc' ? '^' : 'v';
        } else {
            indicator.innerHTML = '';
        }
    });
}

function sortAdminAsistencias(records) {
    const sorted = records.slice();
    const field = window.adminSortConfig.field;
    const direction = window.adminSortConfig.direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
        const valA = getAdminSortValue(a, field);
        const valB = getAdminSortValue(b, field);

        if (valA === valB) return 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
            return (valA - valB) * direction;
        }
        return valA.toString().localeCompare(valB.toString(), 'es', { numeric: true }) * direction;
    });
    return sorted;
}

function actualizarDropdown(id, setValores, valorActual) {
    const select = document.getElementById(id);
    if (!select) return;
    
    // Ordenamos alfabÃ©ticamente las opciones extraÃ­das
    const opciones = Array.from(setValores).filter(Boolean).sort((a, b) => a.localeCompare(b));
    let html = '<option value="">Todos</option>';
    
    opciones.forEach(op => {
        html += `<option value="${op}">${op}</option>`;
    });
    
    select.innerHTML = html;
    select.value = valorActual; // Restauramos la selecciÃ³n previa para que no parpadee/reseteÃ© la vista
}

function limpiarFiltros() {
    document.getElementById('filtro-nombre').value = '';
    if (document.getElementById('filtro-nrc')) document.getElementById('filtro-nrc').value = '';
    if (document.getElementById('filtro-dni')) document.getElementById('filtro-dni').value = '';
    if (document.getElementById('filtro-id')) document.getElementById('filtro-id').value = '';
    document.getElementById('filtro-desde').value = '';
    document.getElementById('filtro-hasta').value = '';
    cargarReporteAsistencias();
}

function limpiarFiltrosMatriz() {
    if (document.getElementById('matriz-desde')) document.getElementById('matriz-desde').value = '';
    if (document.getElementById('matriz-hasta')) document.getElementById('matriz-hasta').value = '';
    cargarReporteAsistencias();
}

function exportarExcel() {
    if (!window.filteredAsistencias || window.filteredAsistencias.length === 0) {
        return alert("No hay datos para exportar.");
    }

    let csv = "\ufeffFecha;Docente;ID;DNI;Curso;NRC;Nº Sesión;Tema;Horas;Cumplimiento\n";
    
    window.filteredAsistencias.forEach(item => {
        const a = item.data;
        const fecha = item.fechaObj ? item.fechaObj.toLocaleDateString() : '---';
        const docente = a.nombre || 'S/N';
        const idDocente = a.id_docente || 'S/N';
        const dniDocente = a.dni || 'S/N';
        const curso = (a.nombreCurso || 'N/A').replace(/"/g, '""');
        const nrc = a.nrc || '---';
        const sesion = a.numeroSesion || '---';
        const tema = (a.temaDictado || '---').replace(/"/g, '""');
        const horas = a.horasTotales ? a.horasTotales.toFixed(2) : '0.00';
        const checks = `${item.totalChecks}/6`;

        csv += `"${fecha}";"${docente}";"${idDocente}";"${dniDocente}";"${curso}";"${nrc}";"${sesion}";"${tema}";"${horas}";"${checks}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Detallado_CTTC_${new Date().toLocaleDateString()}.csv`;
    link.click();
}

async function eliminarAsistencia(id) {
    // Verificar si el usuario actual es un administrador logeado
    if (!auth.currentUser) {
        return alert("Acceso denegado. Solo los administradores pueden eliminar registros.");
    }

    if (confirm("Â¿EstÃ¡s seguro de que deseas eliminar este registro de asistencia?")) {
        try {
            await db.collection('asistencias').doc(id).delete();
            alert("Registro eliminado correctamente.");
            cargarReporteAsistencias(); // Recargar la tabla
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("No se pudo eliminar el registro. Revisa los permisos.");
        }
    }
}

function obtenerNombreMes(fechaStr) {
    if (!fechaStr) return "Periodo Personalizado";
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const partes = fechaStr.split("-"); // Formato YYYY-MM-DD
    if(partes.length >= 2) {
        return meses[parseInt(partes[1]) - 1] + " " + partes[0];
    }
    return "Periodo Personalizado";
}

function generarReporteCierreMes() {
    const resumen = {};
    datosCierreMes = [];

    if (!window.filteredAsistencias || window.filteredAsistencias.length === 0) {
        return alert("No hay datos para generar el reporte. Filtre por fechas primero.");
    }

    const filtroDesde = document.getElementById('filtro-desde').value;
    const nombrePeriodo = obtenerNombreMes(filtroDesde);

    // Agrupar horas por docente
    window.filteredAsistencias.forEach(item => {
        const nombre = item.data.nombre || 'Desconocido';
        const idDocente = item.data.id_docente || 'S/N';
        const dni = item.data.dni || 'S/N';
        const uidDocente = item.data.uid || '';
        const horas = item.data.horasTotales || 0;
        const key = uidDocente || dni || nombre;
        
        if (!resumen[key]) {
            resumen[key] = { nombre, id: idDocente, dni, uid: uidDocente, horas: 0 };
        }
        resumen[key].horas += horas;
    });

    // Construir tabla del modal
    let html = `
        <table class="table table-bordered">
            <thead class="table-light">
                <tr><th>Docente</th><th>ID</th><th>DNI</th><th class="text-end">Total Horas</th></tr>
            </thead>
            <tbody>`;
    
    for (const key in resumen) {
        const d = resumen[key];
        datosCierreMes.push({ docente: d.nombre, id: d.id, dni: d.dni, uid: d.uid || '', horas: d.horas.toFixed(2) });
        html += `
            <tr>
                <td>${d.nombre}</td>
                <td>${d.id}</td>
                <td>${d.dni}</td>
                <td class="text-end fw-bold text-success">${d.horas.toFixed(2)}</td>
            </tr>`;
    }
    html += `</tbody></table>`;
    
    // Insertar contenido
    document.getElementById('contenido-reporte-cierre').innerHTML = html;

    // Actualizar botones del footer para incluir el guardado de planilla
    const footer = document.getElementById('modal-cierre-footer');
    if (footer) {
        footer.innerHTML = `
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-primary fw-bold" onclick="guardarPlanillaBD('${nombrePeriodo}', event)">
                <i class="bi bi-save"></i> Guardar Planilla ${nombrePeriodo}
            </button>
            <button type="button" class="btn btn-success" onclick="exportarCierreExcel()">Exportar CSV</button>
        `;
    }

    // FORMA ALTERNATIVA DE ABRIR EL MODAL (Si la anterior falla)
    const modalElement = document.getElementById('modalCierreMes');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();
}

function exportarCierreExcel() {
    if (datosCierreMes.length === 0) return;

    let csv = "\ufeffDocente;ID;DNI;Total Horas Acumuladas\n";
    datosCierreMes.forEach(d => {
        csv += `"${d.docente}";"${d.id}";"${d.dni}";"${d.horas}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Cierre_Mes_Asistencia.csv`;
    link.click();
}

// --- FUNCIONES DE AUDITORÃA Y PLANILLAS ---

async function guardarPlanillaBD(periodo, event) {
    if (!auth.currentUser) return alert("No tienes permisos para esta acciÃ³n.");
    if (!datosCierreMes || datosCierreMes.length === 0) return alert("No hay datos para guardar.");

    if (!confirm(`Â¿EstÃ¡s seguro de que deseas guardar la planilla de ${periodo} de forma permanente?`)) return;

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    btn.disabled = true;

    try {
        const detallesAuditoria = window.filteredAsistencias.map(item => {
            const dataLimpia = { ...item.data };
            Object.keys(dataLimpia).forEach(key => {
                if (dataLimpia[key] === undefined) delete dataLimpia[key];
            });
            return dataLimpia;
        });

        const planillaRef = await db.collection('planillas').add({
            mes: periodo,
            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
            creadoPor: auth.currentUser.email,
            resumen: datosCierreMes,
            detalles: detallesAuditoria // Copia de seguridad inmutable de las clases exactas
        });

        for (const r of datosCierreMes) {
            await db.collection('firmas_planillas').add({
                planillaId: planillaRef.id,
                mes: periodo,
                docenteNombre: r.docente,
                docenteId: r.id,
                docenteUID: r.uid || null,
                docenteDni: r.dni,
                horasTotales: Number(r.horas) || 0,
                detalles: detallesAuditoria.filter(d => (d.dni || '').toString().trim() === (r.dni || '').toString().trim()),
                firmaJefe: null,
                firmaDocente: null,
                fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        alert(`Planilla de ${periodo} guardada exitosamente y bloqueada para auditoría. Se generaron solicitudes de firma.`);
        
        const modalElement = document.getElementById('modalCierreMes');
        const myModal = bootstrap.Modal.getInstance(modalElement);
        if (myModal) myModal.hide();

    } catch (e) {
        console.error("Error al guardar planilla:", e);
        alert("OcurriÃ³ un error al intentar guardar la planilla en la base de datos.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function cargarPlanillasGuardadas() {
    const tbody = document.getElementById('tabla-planillas-body');
    if (!tbody) return;

    // Desconectamos cualquier suscripción previa antes de crear una nueva
    if (unsubscribePlanillas) {
        unsubscribePlanillas();
        unsubscribePlanillas = null;
    }

    // Usamos onSnapshot para que se actualice en tiempo real sin recargar la página
    unsubscribePlanillas = db.collection('planillas').orderBy('fechaCreacion', 'desc').onSnapshot(snapshot => {
        let html = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No hay planillas histÃ³ricas guardadas.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const p = doc.data();
            const id = doc.id;
            const fecha = p.fechaCreacion ? p.fechaCreacion.toDate().toLocaleString() : 'Reciente';
            const totalDocentes = p.resumen ? p.resumen.length : 0;

            html += `
            <tr>
                <td class="fw-bold text-primary">${p.mes}</td>
                <td>${fecha}</td>
                <td><span class="badge bg-secondary">${totalDocentes} Docentes</span></td>
                <td>
                    <i class="bi bi-lock-fill text-danger" title="Solo lectura"></i> Cerrado
                </td>
                <td class="text-nowrap">
                    <button class="btn btn-sm btn-outline-primary" onclick="abrirModalFirmas('${id}', '${p.mes}')" title="Gestionar Firmas PDF">
                        <i class="bi bi-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="descargarPlanillaGuardada('${id}')" title="Descargar Resumen Excel">
                        <i class="bi bi-file-earmark-excel"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarPlanilla('${id}')" title="Eliminar Planilla Permanente">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    });
}

async function eliminarPlanilla(id) {
    if (!auth.currentUser) return alert("Acceso denegado.");
    if (confirm("âš ï¸ ATENCIÃ“N: Esta acciÃ³n eliminarÃ¡ el registro histÃ³rico de esta planilla de forma definitiva. Â¿Deseas continuar?")) {
        try {
            await db.collection('planillas').doc(id).delete();
            // No es necesario llamar a cargarPlanillasGuardadas porque onSnapshot actualiza solo
        } catch (error) {
            console.error("Error al eliminar planilla:", error);
            alert("No se pudo eliminar la planilla.");
        }
    }
}

async function descargarPlanillaGuardada(id) {
    try {
        const doc = await db.collection('planillas').doc(id).get();
        if (!doc.exists) return alert("La planilla no fue encontrada en la base de datos.");
        
        const data = doc.data();
        const resumen = data.resumen || [];
        
        let csv = "\ufeffDocente;ID;DNI;Total Horas Acumuladas\n";
        resumen.forEach(d => {
            csv += `"${d.docente}";"${d.id}";"${d.dni}";"${d.horas}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Planilla_Auditoria_${data.mes.replace(' ', '_')}.csv`;
        link.click();
    } catch (e) {
        console.error("Error al descargar planilla:", e);
        alert("OcurriÃ³ un error al descargar.");
    }
}

// --- FUNCIONES DE FIRMAS Y PDF ---

let currentPlanillaId = null;
let currentPlanillaMes = null;
let firmasDocs = [];
let firmaJefeBase64 = null;
let firmaDocenteBase64 = null;
let currentFirmaDocId = null;

function previewFirma(event, imgId) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgElement = document.getElementById(imgId);
            if(imgElement) {
                imgElement.src = e.target.result;
                imgElement.style.display = 'inline-block';
            }
            if(imgId === 'preview-firma-jefe') firmaJefeBase64 = e.target.result;
            if(imgId === 'preview-firma-docente') firmaDocenteBase64 = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

function abrirModalFirmas(id, mes) {
    currentPlanillaId = id;
    currentPlanillaMes = mes;
    document.getElementById('firma-planilla-mes').innerText = mes;
    
    const modalElement = document.getElementById('modalFirmasPlanilla');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();
    
    cargarEstadoFirmas();
}

function cargarEstadoFirmas() {
    const tbody = document.getElementById('tabla-firmas-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span> Cargando estado de firmas...</td></tr>';
    
    if (unsubscribeEstadoFirmas) {
        unsubscribeEstadoFirmas();
        unsubscribeEstadoFirmas = null;
    }

    unsubscribeEstadoFirmas = db.collection('firmas_planillas').where('planillaId', '==', currentPlanillaId).onSnapshot(snap => {
        firmasDocs = [];
        let html = '';
        if(snap.empty) {
            html = '<tr><td colspan="7" class="text-center text-muted py-4">No se han generado solicitudes de firma para esta planilla. Haz clic en "Generar/Enviar Solicitudes".</td></tr>';
        } else {
            snap.forEach(doc => {
                const data = doc.data();
                firmasDocs.push({id: doc.id, ...data});
                const estadoDocente = data.firmaDocente ? '<span class="badge bg-success">Firmado</span>' : '<span class="badge bg-warning text-dark">Pendiente</span>';
                const estadoJefe = data.firmaJefe ? '<span class="badge bg-success">Firmado</span>' : '<span class="badge bg-warning text-dark">Pendiente</span>';
                let estadoGral = '';
                if(data.firmaDocente && data.firmaJefe) estadoGral = '<span class="badge bg-success"><i class="bi bi-check-circle-fill"></i> Completado</span>';
                else estadoGral = '<span class="badge bg-warning text-dark"><i class="bi bi-clock"></i> Pendiente</span>';
                
                html += `<tr>
                    <td class="fw-bold">${data.docenteNombre}</td>
                    <td>${data.docenteDni}</td>
                    <td class="text-primary fw-bold">${Number(data.horasTotales).toFixed(2)}</td>
                    <td>${estadoDocente}</td>
                    <td>${estadoJefe}</td>
                    <td>${estadoGral}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="generarPDF('${doc.id}')" ${!(data.firmaDocente && data.firmaJefe) ? 'disabled title="Faltan firmas para generar PDF"' : 'title="Descargar PDF Final"'}>
                            <i class="bi bi-file-earmark-pdf-fill"></i> PDF
                        </button>
                    </td>
                </tr>`;
            });
        }
        tbody.innerHTML = html;
    });
}

async function generarSolicitudesFirma() {
    if(!confirm("Â¿Deseas generar solicitudes de firma para todos los docentes de esta planilla que aÃºn no tienen una?")) return;
    try {
        const docRef = await db.collection('planillas').doc(currentPlanillaId).get();
        if(!docRef.exists) return alert("Error: No se encontrÃ³ la planilla origen.");
        const planillaData = docRef.data();
        
        const resumen = planillaData.resumen || [];
        const detallesTotales = planillaData.detalles || [];
        
        let generados = 0;
        for(let r of resumen) {
            const existe = firmasDocs.find(f => f.docenteDni === r.dni);
            if(!existe) {
                const detallesDocente = detallesTotales.filter(d => d.dni === r.dni);
                await db.collection('firmas_planillas').add({
                    planillaId: currentPlanillaId,
                    mes: currentPlanillaMes,
                    docenteNombre: r.docente,
                    docenteId: r.id,
                    docenteDni: r.dni,
                    horasTotales: r.horas,
                    detalles: detallesDocente,
                    firmaJefe: null,
                    firmaDocente: null,
                    fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
                });
                generados++;
            }
        }
        alert(`Se generaron ${generados} nuevas solicitudes de firma para los docentes.`);
    } catch(e) {
        console.error("Error al generar solicitudes:", e);
        alert("OcurriÃ³ un error al generar las solicitudes.");
    }
}

function firmarComoJefeMasivo() {
    const modalElement = document.getElementById('modalSubirFirma');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    
    document.getElementById('input-firma-jefe').value = '';
    document.getElementById('preview-firma-jefe').style.display = 'none';
    firmaJefeBase64 = null;
    
    myModal.show();
}

async function guardarFirmaJefe() {
    if(!firmaJefeBase64) return alert("Por favor, selecciona una imagen de tu firma primero.");
    const pendientes = firmasDocs.filter(f => !f.firmaJefe);
    if(pendientes.length === 0) {
        alert("No hay documentos en esta planilla que estÃ©n pendientes de tu firma.");
        return;
    }
    
    try {
        const batch = db.batch();
        pendientes.forEach(p => {
            const ref = db.collection('firmas_planillas').doc(p.id);
            batch.update(ref, { firmaJefe: firmaJefeBase64 });
        });
        await batch.commit();
        
        alert(`Â¡Firma aplicada exitosamente a ${pendientes.length} documentos!`);
        const modalElement = document.getElementById('modalSubirFirma');
        const myModal = bootstrap.Modal.getInstance(modalElement);
        myModal.hide();
    } catch(e) {
        console.error("Error aplicando firma de jefe:", e);
        alert("OcurriÃ³ un error al intentar firmar los documentos.");
    }
}

function verificarFirmasPendientes() {
    if (unsubscribeFirmasPendientes) {
        unsubscribeFirmasPendientes();
        unsubscribeFirmasPendientes = null;
    }

    unsubscribeFirmasPendientes = db.collection('firmas_planillas')
        .where('docenteDni', '==', docenteDNI)
        .where('firmaDocente', '==', null)
        .onSnapshot(snap => {
            let container = document.getElementById('firmas-pendientes-container');
            
            if (!snap.empty) {
                if (!container) {
                    const welcomeMsg = document.getElementById('welcome-msg');
                    if (welcomeMsg) {
                        welcomeMsg.insertAdjacentHTML('afterend', `
                            <div class="mt-2 mb-3" id="firmas-pendientes-container">
                                <button id="btn-firmas-pendientes" class="btn btn-warning btn-sm rounded-pill fw-bold shadow-sm position-relative" onclick="abrirModalFirmaDocente()">
                                    <i class="bi bi-pen-fill"></i> Tienes documentos por firmar
                                    <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" id="badge-firmas">
                                        ${snap.size}
                                    </span>
                                </button>
                            </div>
                        `);
                    }
                } else {
                    const badge = document.getElementById('badge-firmas');
                    if(badge) badge.innerText = snap.size;
                }
                window.firmasPendientesDocs = snap.docs.map(d => ({id: d.id, ...d.data()}));
            } else {
                if(container) container.remove();
                window.firmasPendientesDocs = [];
            }
        });
}

function abrirModalFirmaDocente(firmaDocId = null) {
    let docData;
    if (firmaDocId) {
        currentFirmaDocId = firmaDocId;
        // Si el docente abre una planilla directa desde la lista, intentamos usar los datos ya cargados.
        docData = (window.docentePlanillasData || []).find(d => d.id === firmaDocId);
    }

    if (!docData) {
        if (!window.firmasPendientesDocs || window.firmasPendientesDocs.length === 0) return;
        docData = window.firmasPendientesDocs[0];
        currentFirmaDocId = docData.id;
    }

    if (!document.getElementById('modalFirmaDocente')) {
        const modalHTML = `
        <div class="modal fade" id="modalFirmaDocente" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title fw-bold"><i class="bi bi-pen"></i> Firma Requerida</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info py-2">
                            <div class="mb-1"><strong>Periodo:</strong> <span id="fd-mes"></span></div>
                            <div class="mb-1"><strong>Total Horas:</strong> <span id="fd-horas" class="fw-bold text-success"></span> hrs</div>
                        </div>
                        <p class="small text-muted mb-2">Por favor, sube una foto de tu firma o rÃºbrica para validar formalmente este reporte de asistencia mensual.</p>
                        <div class="text-center p-3 bg-light border rounded">
                            <input type="file" id="input-firma-docente" accept="image/*" class="form-control mb-3" onchange="previewFirma(event, 'preview-firma-docente')">
                            <img id="preview-firma-docente" style="max-width: 100%; max-height: 120px; display: none;" class="border rounded shadow-sm">
                        </div>
                    </div>
                    <div class="modal-footer d-flex justify-content-between align-items-center">
                        <span class="small text-muted fw-bold" id="fd-restantes"></span>
                        <button type="button" class="btn btn-primary fw-bold px-4" onclick="guardarFirmaDocente()">
                            <i class="bi bi-check2-circle"></i> Firmar Documento
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    document.getElementById('fd-mes').innerText = docData.mes;
    document.getElementById('fd-horas').innerText = docData.horasTotales;
    
    const restantesEl = document.getElementById('fd-restantes');
    if(window.firmasPendientesDocs && window.firmasPendientesDocs.length > 1) {
        restantesEl.innerText = `1 de ${window.firmasPendientesDocs.length} documentos pendientes`;
    } else {
        restantesEl.innerText = '';
    }
    
    document.getElementById('input-firma-docente').value = '';
    document.getElementById('preview-firma-docente').style.display = 'none';
    firmaDocenteBase64 = null;
    
    const modalElement = document.getElementById('modalFirmaDocente');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();
}

async function guardarFirmaDocente() {
    if(!firmaDocenteBase64) return alert("Por favor, sube la imagen de tu firma antes de continuar.");
    if(!currentFirmaDocId) return;
    
    try {
        await db.collection('firmas_planillas').doc(currentFirmaDocId).update({
            firmaDocente: firmaDocenteBase64
        });
        alert("Â¡Tu firma ha sido guardada y el documento validado correctamente!");
        
        const modalElement = document.getElementById('modalFirmaDocente');
        const myModal = bootstrap.Modal.getInstance(modalElement);
        myModal.hide();
        
        if (window.firmasPendientesDocs.length > 1) {
            setTimeout(abrirModalFirmaDocente, 500); 
        }
    } catch (e) {
        console.error("Error guardando firma docente:", e);
        alert("OcurriÃ³ un error al guardar tu firma. Verifica tu conexiÃ³n.");
    }
}

async function generarPDF(firmaDocId, allowDraft = false) {
    try {
        const docRef = await db.collection('firmas_planillas').doc(firmaDocId).get();
        if(!docRef.exists) return alert("Error: No se encontrÃ³ el documento de firma.");
        const data = docRef.data();
        
        if(!allowDraft && (!data.firmaDocente || !data.firmaJefe)) return alert("No se puede generar el PDF porque faltan firmas.");
        
        if (!window.jspdf) {
            return alert("La librerÃ­a para generar PDF no estÃ¡ cargada. Actualiza la pÃ¡gina e intenta de nuevo.");
        }

        const getImgFormat = (b64) => {
            if(b64.startsWith("data:image/png")) return "PNG";
            if(b64.startsWith("data:image/jpeg") || b64.startsWith("data:image/jpg")) return "JPEG";
            if(b64.startsWith("data:image/webp")) return "WEBP";
            return "PNG"; 
        };

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(0, 143, 57);
        pdf.text("REPORTE MENSUAL DE ASISTENCIA TÃ‰CNICA Y CAPACITACIÃ“N", 105, 20, { align: "center" });
        
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(0, 0, 0);
        
        pdf.text(`Docente:`, 14, 35);
        pdf.setFont("helvetica", "bold");
        pdf.text(data.docenteNombre, 35, 35);
        
        pdf.setFont("helvetica", "normal");
        pdf.text(`DNI: ${data.docenteDni}`, 14, 42);
        pdf.text(`Periodo: ${data.mes}`, 14, 49);
        
        pdf.text(`Total Horas Acumuladas:`, 14, 56);
        pdf.setFont("helvetica", "bold");
        pdf.text(`${Number(data.horasTotales).toFixed(2)} hrs`, 60, 56);
        
        if(data.detalles && data.detalles.length > 0) {
            data.detalles.sort((a, b) => {
                const dateA = a.inicio ? a.inicio.toDate() : new Date(0);
                const dateB = b.inicio ? b.inicio.toDate() : new Date(0);
                return dateA - dateB;
            });

            const body = data.detalles.map(d => {
                const fecha = d.inicio ? d.inicio.toDate().toLocaleDateString() : '---';
                return [
                    fecha,
                    d.nombreCurso || '---',
                    d.nrc || '---',
                    d.temaDictado || '---',
                    (d.horasTotales || 0).toFixed(2)
                ];
            });
            
            pdf.autoTable({
                startY: 65,
                head: [['Fecha', 'Curso', 'NRC', 'Tema Dictado', 'Horas']],
                body: body,
                theme: 'grid',
                headStyles: { fillColor: [0, 143, 57], textColor: [255, 255, 255] },
                styles: { fontSize: 9, cellPadding: 2 }
            });
        }
        
        const finalY = (pdf.lastAutoTable ? pdf.lastAutoTable.finalY : 65) + 30;
        if(finalY > 240) pdf.addPage();
        
        if(data.firmaDocente) {
            try {
                pdf.addImage(data.firmaDocente, getImgFormat(data.firmaDocente), 30, finalY, 40, 20);
            } catch(e) { console.warn("Aviso: No se pudo incrustar firma docente.", e); }
        }
        pdf.setDrawColor(150);
        pdf.line(20, finalY + 22, 80, finalY + 22);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text("Firma del Docente", 50, finalY + 27, { align: "center" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(data.docenteNombre, 50, finalY + 32, { align: "center" });
        
        if(data.firmaJefe) {
            try {
                pdf.addImage(data.firmaJefe, getImgFormat(data.firmaJefe), 130, finalY, 40, 20);
            } catch(e) { console.warn("Aviso: No se pudo incrustar firma jefe.", e); }
        }
        pdf.line(120, finalY + 22, 180, finalY + 22);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.text("Jefe de CapacitaciÃ³n CTTC", 150, finalY + 27, { align: "center" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text("Jean Rodriguez", 150, finalY + 32, { align: "center" });
        
        pdf.save(`Reporte_Firmado_${data.docenteNombre.replace(/\s+/g, '_')}_${data.mes.replace(/\s+/g, '_')}.pdf`);
        
    } catch(e) {
        console.error("Error general generando PDF:", e);
        alert("OcurriÃ³ un error al construir el PDF. Intenta de nuevo.");
    }
}

// --- FUNCIONES PARA EDITAR HORAS ---

function abrirModalEdicion(id) {
    const data = window.datosEdicion && window.datosEdicion[id];
    if (!data) {
        alert("No se encontrÃ³ la informaciÃ³n local del registro. Por favor, recarga la pÃ¡gina.");
        return;
    }

    document.getElementById('edit-id').value = id;
    if (document.getElementById('edit-nombre')) document.getElementById('edit-nombre').value = data.nombre || '';
    if (document.getElementById('edit-nrc')) document.getElementById('edit-nrc').value = data.nrc || '';
    if (document.getElementById('edit-fecha')) document.getElementById('edit-fecha').value = data.fecha || '';
    document.getElementById('edit-horas').value = data.horas || 0;
    document.getElementById('edit-motivo').value = data.motivo || '';
    
    // Abrir el modal usando la API de Bootstrap
    const modalElement = document.getElementById('modalEditarHora');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();
}

async function guardarEdicionHora() {
    // Verificar si el usuario actual es un administrador logeado
    if (!auth.currentUser) {
        return alert("Acceso denegado. Solo los administradores pueden editar registros.");
    }

    const id = document.getElementById('edit-id').value;
    const nombre = document.getElementById('edit-nombre') ? document.getElementById('edit-nombre').value.trim() : null;
    const nrc = document.getElementById('edit-nrc') ? document.getElementById('edit-nrc').value.trim() : null;
    const fechaSeleccionada = document.getElementById('edit-fecha') ? document.getElementById('edit-fecha').value : null;
    const horas = parseFloat(document.getElementById('edit-horas').value);
    const motivo = document.getElementById('edit-motivo').value;

    if (!id || isNaN(horas)) {
        return alert("Por favor, ingresa una cantidad de horas vÃ¡lida.");
    }

    try {
        const updateData = {
            horasTotales: horas,
            comentariosEdit: motivo
        };
        if (nombre !== null) {
            updateData.nombre = nombre;
        }
        if (nrc !== null) {
            updateData.nrc = nrc;
        }

        const originalData = window.datosEdicion && window.datosEdicion[id];
        if (originalData && fechaSeleccionada) {
            const fechaOriginal = originalData.fecha || '';
            if (fechaSeleccionada !== fechaOriginal && originalData.inicioTimestamp) {
                const originalInicio = new Date(originalData.inicioTimestamp);
                const hoursStr = String(originalInicio.getHours()).padStart(2, '0');
                const minutesStr = String(originalInicio.getMinutes()).padStart(2, '0');
                const secondsStr = String(originalInicio.getSeconds()).padStart(2, '0');
                const nuevoInicio = new Date(`${fechaSeleccionada}T${hoursStr}:${minutesStr}:${secondsStr}`);
                if (!isNaN(nuevoInicio.getTime())) {
                    updateData.inicio = firebase.firestore.Timestamp.fromDate(nuevoInicio);
                }

                if (originalData.finTimestamp && !isNaN(nuevoInicio.getTime())) {
                    const originalFin = new Date(originalData.finTimestamp);
                    const duracionMs = originalFin.getTime() - originalInicio.getTime();
                    const nuevoFin = new Date(nuevoInicio.getTime() + duracionMs);
                    updateData.fin = firebase.firestore.Timestamp.fromDate(nuevoFin);
                }
            }
        }
        
        await db.collection('asistencias').doc(id).update(updateData);
        
        const modalElement = document.getElementById('modalEditarHora');
        const myModal = bootstrap.Modal.getInstance(modalElement);
        myModal.hide(); // Cerrar el modal

        alert("EdiciÃ³n guardada correctamente.");
        cargarReporteAsistencias(); // Refrescar la tabla
    } catch (error) {
        console.error("Error al editar:", error);
        alert("No se pudo guardar la ediciÃ³n. Revisa tu conexiÃ³n y permisos.");
    }
}

// --- FUNCIONES DE LA MATRIZ DE ASISTENCIA ---

function renderizarMatriz(registros) {
    const container = document.getElementById('contenedor-matriz');
    if (!container) return;

    if (registros.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No hay datos para mostrar en la matriz.</div>';
        return;
    }

    // 1. Obtener fechas Ãºnicas (ignorar la hora para unificar por dÃ­a)
    const fechasSet = new Set();
    registros.forEach(r => {
        if (r.fechaObj) {
            const year = r.fechaObj.getFullYear();
            const month = String(r.fechaObj.getMonth() + 1).padStart(2, '0');
            const day = String(r.fechaObj.getDate()).padStart(2, '0');
            fechasSet.add(`${year}-${month}-${day}`);
        }
    });
    const fechas = Array.from(fechasSet).sort();

    // 2. Agrupar por docente
    const docentes = {};
    registros.forEach(r => {
        if (!r.fechaObj) return;
        const docId = r.uid;
        if (!docentes[docId]) {
            docentes[docId] = { nombre: r.nombre, uid: r.uid, id_docente: r.id_docente, dni: r.dni, dias: {} };
        }
        
        const year = r.fechaObj.getFullYear();
        const month = String(r.fechaObj.getMonth() + 1).padStart(2, '0');
        const day = String(r.fechaObj.getDate()).padStart(2, '0');
        const fechaStr = `${year}-${month}-${day}`;

        if (!docentes[docId].dias[fechaStr]) {
            docentes[docId].dias[fechaStr] = { horas: 0, modalidades: new Set() };
        }
        docentes[docId].dias[fechaStr].horas += r.horas;
        
        // Determinar Siglas de la modalidad
        const modStr = r.modalidad.toLowerCase().includes('presencial') ? 'TP' : 'TT';
        docentes[docId].dias[fechaStr].modalidades.add(modStr);
    });

    // 3. Generar HTML
    let html = '<div class="table-responsive"><table class="table table-bordered table-hover align-middle text-center" id="tabla-datos-matriz"><thead class="table-dark">';
    
    // Primera fila (Docentes y Fechas)
    html += '<tr><th rowspan="2" class="align-middle">Docente</th><th rowspan="2" class="align-middle">ID</th><th rowspan="2" class="align-middle">DNI</th>';
    fechas.forEach(f => {
        const partes = f.split('-'); // Formato corto: DD/MM
        html += `<th colspan="2">${partes[2]}/${partes[1]}</th>`;
    });
    html += '<th rowspan="2" class="align-middle bg-secondary text-white">Total Horas</th>';
    html += '</tr><tr>';
    
    // Segunda fila (Columnas divididas en Horas y Modalidad)
    fechas.forEach(() => {
        html += '<th>Horas</th><th>Mod.</th>';
    });
    html += '</tr></thead><tbody>';

    // Llenar cuerpo por cada docente
    Object.values(docentes).forEach(d => {
        let totalHorasDocente = 0;
        html += `<tr><td class="text-start text-nowrap fw-bold">${d.nombre}</td><td class="text-nowrap">${d.id_docente}</td><td class="text-nowrap">${d.dni}</td>`;
        fechas.forEach(f => {
            const dia = d.dias[f];
            if (dia) {
                totalHorasDocente += dia.horas;
                const mods = Array.from(dia.modalidades).join('/'); // si tuviera TP y TT en un dÃ­a mostrarÃ¡ TP/TT
                const badgeClass = mods.includes('TP') ? 'bg-success' : 'bg-info text-dark';
                html += `<td>${dia.horas.toFixed(2)}</td><td><span class="badge ${badgeClass}">${mods}</span></td>`;
            } else {
                html += '<td class="text-muted bg-light">-</td><td class="text-muted bg-light">-</td>';
            }
        });
        html += `<td class="fw-bold bg-light text-primary">${totalHorasDocente.toFixed(2)}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function exportarMatrizExcel() {
    const tabla = document.getElementById("tabla-datos-matriz");
    if (!tabla) return alert("No hay datos en la matriz para exportar.");

    let csv = "\ufeff"; // BOM para correcta codificaciÃ³n en Excel de Tildes y Ã‘
    const rows = tabla.querySelectorAll("tr");
    
    rows.forEach(row => {
        let rowData = [];
        const cols = row.querySelectorAll("th, td");
        cols.forEach(col => {
            const text = col.innerText.trim().replace(/\n/g, ' - ');
            rowData.push(`"${text}"`);
            // Para compatibilizar el colspan con CSV, creamos columnas en blanco al lado
            if(col.hasAttribute("colspan")) {
                const colspan = parseInt(col.getAttribute("colspan"));
                for(let i = 1; i < colspan; i++) rowData.push('""');
            }
        });
        csv += rowData.join(";") + "\n";
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Matriz_Asistencia_Docentes_${new Date().toLocaleDateString()}.csv`;
    link.click();
}

// --- AUTENTICACIÃ“N DEL ADMINISTRADOR ---

auth.onAuthStateChanged(user => {
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    
    // Verificamos si estamos en admin.html (donde existen estos contenedores)
    if (loginContainer && dashboardContainer) {
        if (user) {
            loginContainer.style.display = 'none';
            dashboardContainer.style.display = 'block';
            cargarReporteAsistencias(); // Solo cargamos los datos si iniciÃ³ sesiÃ³n
            cargarPlanillasGuardadas(); // Carga el histÃ³rico de auditorÃ­a
        } else {
            loginContainer.style.display = 'block';
            dashboardContainer.style.display = 'none';
        }
    }
});

async function loginAdmin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const pass = document.getElementById('admin-password').value;
    const errorMsg = document.getElementById('login-error');
    
    try {
        await auth.signInWithEmailAndPassword(email, pass);
        errorMsg.style.display = 'none';
    } catch (error) {
        console.error("Error de login:", error);
        errorMsg.style.display = 'block';
        errorMsg.innerText = "Correo o contraseÃ±a incorrectos.";
    }
}

function logoutAdmin() {
    if (unsubscribePlanillas) {
        unsubscribePlanillas();
        unsubscribePlanillas = null;
    }
    if (unsubscribeEstadoFirmas) {
        unsubscribeEstadoFirmas();
        unsubscribeEstadoFirmas = null;
    }
    if (unsubscribeFirmasPendientes) {
        unsubscribeFirmasPendientes();
        unsubscribeFirmasPendientes = null;
    }
    auth.signOut();
}
