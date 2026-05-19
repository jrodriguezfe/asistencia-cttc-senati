// Configuración de Firebase (Usa las mismas de tu catálogo)
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

// Configuración de la segunda base de datos (Programaciones CTTC)
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

// Capturar parámetros de la URL enviados desde el Catálogo
const params = new URLSearchParams(window.location.search);
const docenteNombre = params.get('name');
const docenteUID = params.get('uid');
const docenteDNI = params.get('dni');
const docenteID = params.get('id');
const docenteRol = params.get('rol');

// Verifica en consola si los datos llegan al cargar la página
console.log("Datos recibidos:", { docenteUID, docenteNombre, docenteDNI, docenteID, docenteRol });



// 1. RECUPERACIÓN AUTOMÁTICA AL CARGAR LA PÁGINA
document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('welcome-msg')) {
        const welcomeMsg = document.getElementById('welcome-msg');
        welcomeMsg.innerText = `Hola, ${docenteNombre || 'Docente'}`;
        
        // Inyectar el botón de "Mis Registros" dinámicamente debajo del nombre
        if (!document.getElementById('btn-mis-registros')) {
            welcomeMsg.insertAdjacentHTML('afterend', `
                <div class="mt-2 mb-3">
                    <button id="btn-mis-registros" class="btn btn-success btn-sm rounded-pill fw-bold shadow-sm" onclick="verMisRegistros()">
                        <i class="bi bi-clock-history"></i> Mis Registros
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
                console.log("Sesión excedió las 8 horas. Finalizando automáticamente...");
                
                await db.collection('asistencias').doc(idDoc).update({
                    fin: firebase.firestore.FieldValue.serverTimestamp(),
                    horasTotales: 8.00, // Se castiga o limita a 8 horas
                    estado: "finalizado_auto",
                    comentarios: (data.comentarios || "") + " [CIERRE AUTOMÁTICO POR EXCESO DE TIEMPO]"
                });

                localStorage.removeItem('sesion_startTime');
                alert("Tenías una sesión abierta de hace más de 8 horas. Se ha cerrado automáticamente con el límite de tiempo permitido.");
                location.reload();
                return;
            }

            // 3. Si es menor a 8 horas, recuperar normalmente
            currentAsistenciaId = idDoc;
            
            // Recuperar el startTime exacto de localStorage para que no se reinicie el cronómetro
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
            
            // Aviso visual de sincronización
            const timerDisplay = document.getElementById('timer-display');
            timerDisplay.classList.add('text-success');
            console.log("Sesión sincronizada desde la nube.");
        }
    } catch (error) {
        console.error("Error en la sincronización:", error);
    }
});



// FUNCIONES DE MARCACIÓN
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

// Función para limpiar los placeholders de sesión y tema
function resetSessionPlaceholders() {
    const sesionInput = document.getElementById('sesion-input');
    const temaInput = document.getElementById('tema-input');
    if (sesionInput) {
        sesionInput.placeholder = "Ej: 1";
        sesionInput.title = "";
    }
    if (temaInput) {
        temaInput.placeholder = "Ej: Introducción a la seguridad...";
        temaInput.title = "";
    }
}

async function buscarInfoNRC() {
    const nrcInput = document.getElementById('nrc-input');
    const cursoInput = document.getElementById('curso-input');
    const loadingText = document.getElementById('nrc-loading');
    const infoCard = document.getElementById('nrc-info-card');
    
    let nrcValue = nrcInput.value;
    nrcValue = nrcValue ? nrcValue.toString().trim() : '';
    
    // Filtrar para que solo acepte caracteres numéricos en caso de copiar y pegar
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
            // Intentar buscar el NRC asumiendo que se guardó como Texto
            let snapshot = await dbProgramacion.collection('programaciones').where('NRC', '==', nrcValue).limit(1).get();
            
            // Si no lo encuentra, intentar buscarlo asumiendo que se guardó como Número
            if (snapshot.empty) {
                snapshot = await dbProgramacion.collection('programaciones').where('NRC', '==', Number(nrcValue)).limit(1).get();
            }

            // Si aún no lo encuentra, intentar con la propiedad en minúscula "nrc" (Texto y Número)
            if (snapshot.empty) {
                snapshot = await dbProgramacion.collection('programaciones').where('nrc', '==', nrcValue).limit(1).get();
            }
            if (snapshot.empty) {
                snapshot = await dbProgramacion.collection('programaciones').where('nrc', '==', Number(nrcValue)).limit(1).get();
            }

            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                console.log("✅ NRC Encontrado en Firebase:", data); // Ayuda para depurar en consola
                // Función auxiliar para extraer el campo ignorando mayúsculas/minúsculas o espacios accidentales
                const getField = (obj, propName) => {
                    const key = Object.keys(obj).find(k => k.trim().toLowerCase() === propName.trim().toLowerCase());
                    return key ? obj[key] : null;
                };
                
                cursoInput.value = getField(data, 'MODULO-CURSO') || getField(data, 'CURSO') || '';
                document.getElementById('nrc-horario').innerText = getField(data, 'Horario') || '---';
                document.getElementById('nrc-duracion').innerText = getField(data, 'Duración') || getField(data, 'Duracion') || '---';
                document.getElementById('nrc-inicio').innerText = getField(data, 'Fecha de inicio') || getField(data, 'Inicio') || '---';
                document.getElementById('nrc-fin').innerText = getField(data, 'Fecha de fin') || getField(data, 'Fin') || '---';
                
                infoCard.style.display = 'block';
                loadingText.style.display = 'none';

                // --- INICIO: Lógica para sugerir siguiente sesión y tema ---
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
                            // Ordenar descendentemente por fecha para obtener el último
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
                                sesionInput.title = `La última sesión registrada fue: ${lastSesion}`;
                            } else {
                                sesionInput.placeholder = "Ej: 1";
                            }
                            
                            if (lastTema) {
                                temaInput.placeholder = `Último tema: ${lastTema}`;
                                temaInput.title = `Último tema: ${lastTema}`;
                            } else {
                                temaInput.placeholder = "Ej: Introducción a la seguridad...";
                            }
                        } else {
                            // No hay registros previos para este NRC
                            sesionInput.placeholder = "Ej: 1 (Primer registro)";
                            sesionInput.title = "Primer registro para este NRC";
                            temaInput.placeholder = "Ej: Introducción a la seguridad...";
                        }
                    }
                } catch (err) {
                    console.warn("No se pudo buscar la última sesión para sugerencias:", err);
                }
                // --- FIN: Lógica para sugerir siguiente sesión y tema ---
            } else {
                console.warn("⚠️ NRC no encontrado en la base de datos.");
                cursoInput.value = '';
                infoCard.style.display = 'none';
                
                loadingText.style.display = 'block';
                loadingText.innerHTML = '<i class="bi bi-exclamation-circle"></i> NRC no encontrado';
                loadingText.className = "form-text text-danger small mt-1";
                resetSessionPlaceholders();
            }
        } catch (error) {
            console.error("Error al buscar información del NRC:", error);
            loadingText.style.display = 'block';
            loadingText.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Error: ${error.message || 'Fallo de conexión'}`;
            loadingText.className = "form-text text-danger small mt-1";
            resetSessionPlaceholders();
        }
    }, 800); // 800 milisegundos de espera tras la última pulsación
}

async function endSession() {
    // 1. Verificación de seguridad de la sesión
    if (!currentAsistenciaId) {
        return alert("Error: No se encontró una sesión activa. Por favor, recarga la página.");
    }

    // Captura de campos obligatorios
    const cursoInput = document.getElementById('curso-input');
    const nrcInput = document.getElementById('nrc-input');
    const temaInput = document.getElementById('tema-input');

    if (!cursoInput || !nrcInput || !temaInput) {
        return alert("Error técnico: No se encuentran los campos en el HTML. Por favor, limpia la caché (Ctrl+F5).");
    }

    const curso = cursoInput.value.trim();
    const nrc = nrcInput.value.trim();
    const tema = temaInput.value.trim();

    if (!curso || !nrc || !tema) {
        return alert("⚠️ Por favor, complete los campos obligatorios (Curso, NRC y Tema) antes de finalizar.");
    }

    // 2. Deshabilitar el botón para evitar el "Doble Clic"
    const btnFinalizar = document.querySelector('#end-zone .btn-danger');
    if (btnFinalizar) {
        btnFinalizar.disabled = true;
        btnFinalizar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    }

    // 3. Cálculo seguro de las horas
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
        alert("✅ Jornada guardada y sincronizada exitosamente.");
        location.reload(); 
    } catch (error) {
        console.error("Error al finalizar:", error);
        alert("❌ Error al finalizar la sesión. Verifique su conexión.");
        
        // Si ocurre un error, volvemos a habilitar el botón para reintentar
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

    // Crear el modal dinámicamente si no existe, manteniendo el HTML limpio
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
                            <span class="text-muted small">Tus últimos registros</span>
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

    // Solución al bug de múltiples clics en Bootstrap 5
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
                    <h6 class="mb-0 fw-bold text-success"><i class="bi bi-calendar2-check"></i> ${filtroDesde || filtroHasta ? 'Total de Horas (Filtradas)' : 'Total Histórico de Horas'}</h6>
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
                ? '<span class="badge bg-warning text-dark" title="Cierre Automático (8h)">Auto</span>' 
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
        document.getElementById('tabla-mis-registros').innerHTML = '<tr><td colspan="5" class="text-danger py-3">Error al cargar los registros. Revisa tu conexión a internet.</td></tr>';
    }
}

function limpiarFiltrosMisRegistros() {
    if (document.getElementById('mis-registros-desde')) document.getElementById('mis-registros-desde').value = '';
    if (document.getElementById('mis-registros-hasta')) document.getElementById('mis-registros-hasta').value = '';
    verMisRegistros();
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
        const estado = r.estado === 'finalizado_auto' ? 'Cierre Automático' : 'Completado';

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

    // 1. Captura de todos los filtros (Asegúrate de tener el input 'filtro-nrc' en tu HTML)
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
        
        let registrosMatriz = []; // Almacenará datos para el cuadro de doble entrada
        window.datosEdicion = {}; // Guardar en memoria local para evitar consultas extra en Firebase
        window.filteredAsistencias = []; // <-- Arreglo para exportación y cierre de mes

        let uniqueNombres = new Set();
        let uniqueNRCs = new Set();
        let uniqueDNIs = new Set();
        let uniqueIDs = new Set();

        // 1. Procesar todos los documentos, filtrar y poblar los arreglos de datos
        snapshot.forEach(doc => {
            const a = doc.data();
            const id = doc.id;

            if (a.estado === "finalizado" || a.estado === "finalizado_auto") {
                // Redondear el tiempo trabajado al límite inferior de cada media hora (piso)
                a.horasTotales = Math.floor((a.horasTotales || 0) * 2) / 2;

                if (a.nombre) uniqueNombres.add(a.nombre.trim());
                if (a.nrc) uniqueNRCs.add(a.nrc.toString().trim());
                if (a.dni) uniqueDNIs.add(a.dni.toString().trim());
                if (a.id_docente) uniqueIDs.add(a.id_docente.toString().trim());

                const fechaObj = a.inicio ? a.inicio.toDate() : null;
                const fechaISO = fechaObj ? fechaObj.toISOString().split('T')[0] : '';
                
                let cumpleNombre = filtroNombre === "" || a.nombre.trim().toLowerCase() === filtroNombre;
                let cumpleNRC = filtroNRC === "" || (a.nrc && a.nrc.toString().trim().toLowerCase() === filtroNRC);
                let cumpleDNI = filtroDni === "" || (a.dni && a.dni.toString().trim().toLowerCase() === filtroDni);
                let cumpleID = filtroId === "" || (a.id_docente && a.id_docente.toString().trim().toLowerCase() === filtroId);
                let cumpleDesde = filtroDesde ? (fechaISO >= filtroDesde) : true;
                let cumpleHasta = filtroHasta ? (fechaISO <= filtroHasta) : true;

                if (cumpleNombre && cumpleNRC && cumpleDNI && cumpleID && cumpleDesde && cumpleHasta) {
                    sumaTotal += a.horasTotales;
                    
                    window.datosEdicion[id] = { nombre: a.nombre || '', horas: a.horasTotales, motivo: a.comentariosEdit || '' };
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

                // Lógica separada para poblar la matriz con sus propios filtros de fechas
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

        // 2. Determinar qué registros mostrar y construir el HTML de la tabla
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
                '<i class="bi bi-exclamation-triangle-fill text-danger" title="Cierre Automático (8h)"></i>' : "";

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
                    controlsContainer.innerHTML = `<button class="btn btn-sm btn-link" onclick="toggleAdminView()">Ver solo los últimos 10</button>`;
                } else {
                    summaryContainer.innerHTML = `Mostrando los últimos <strong>10</strong> de <strong>${totalFiltrado}</strong> registros.`;
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

function actualizarDropdown(id, setValores, valorActual) {
    const select = document.getElementById(id);
    if (!select) return;
    
    // Ordenamos alfabéticamente las opciones extraídas
    const opciones = Array.from(setValores).filter(Boolean).sort((a, b) => a.localeCompare(b));
    let html = '<option value="">Todos</option>';
    
    opciones.forEach(op => {
        html += `<option value="${op}">${op}</option>`;
    });
    
    select.innerHTML = html;
    select.value = valorActual; // Restauramos la selección previa para que no parpadee/reseteé la vista
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

    let csv = "\ufeffFecha;Docente;ID;DNI;Curso;NRC;Tema;Horas;Cumplimiento\n";
    
    window.filteredAsistencias.forEach(item => {
        const a = item.data;
        const fecha = item.fechaObj ? item.fechaObj.toLocaleDateString() : '---';
        const docente = a.nombre || 'S/N';
        const idDocente = a.id_docente || 'S/N';
        const dniDocente = a.dni || 'S/N';
        const curso = (a.nombreCurso || 'N/A').replace(/"/g, '""');
        const nrc = a.nrc || '---';
        const tema = (a.temaDictado || '---').replace(/"/g, '""');
        const horas = a.horasTotales ? a.horasTotales.toFixed(2) : '0.00';
        const checks = `${item.totalChecks}/6`;

        csv += `"${fecha}";"${docente}";"${idDocente}";"${dniDocente}";"${curso}";"${nrc}";"${tema}";"${horas}";"${checks}"\n`;
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

    if (confirm("¿Estás seguro de que deseas eliminar este registro de asistencia?")) {
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
        const horas = item.data.horasTotales || 0;
        
        if (!resumen[nombre]) {
            resumen[nombre] = { nombre, id: idDocente, dni, horas: 0 };
        }
        resumen[nombre].horas += horas;
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
        datosCierreMes.push({ docente: d.nombre, id: d.id, dni: d.dni, horas: d.horas.toFixed(2) });
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

// --- FUNCIONES DE AUDITORÍA Y PLANILLAS ---

async function guardarPlanillaBD(periodo, event) {
    if (!auth.currentUser) return alert("No tienes permisos para esta acción.");
    if (!datosCierreMes || datosCierreMes.length === 0) return alert("No hay datos para guardar.");

    if (!confirm(`¿Estás seguro de que deseas guardar la planilla de ${periodo} de forma permanente?`)) return;

    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando...';
    btn.disabled = true;

    try {
        // Se guarda un historial crudo de cada registro exacto (auditoría profunda)
        // SANITIZACIÓN: Limpiamos cualquier campo 'undefined' que pueda hacer que Firebase rechace la petición
        const detallesAuditoria = window.filteredAsistencias.map(item => {
            const dataLimpia = { ...item.data };
            Object.keys(dataLimpia).forEach(key => {
                if (dataLimpia[key] === undefined) delete dataLimpia[key];
            });
            return dataLimpia;
        });

        await db.collection('planillas').add({
            mes: periodo,
            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp(),
            creadoPor: auth.currentUser.email,
            resumen: datosCierreMes,
            detalles: detallesAuditoria // Copia de seguridad inmutable de las clases exactas
        });

        alert(`Planilla de ${periodo} guardada exitosamente y bloqueada para auditoría.`);
        
        const modalElement = document.getElementById('modalCierreMes');
        const myModal = bootstrap.Modal.getInstance(modalElement);
        if (myModal) myModal.hide();

    } catch (e) {
        console.error("Error al guardar planilla:", e);
        alert("Ocurrió un error al intentar guardar la planilla en la base de datos.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function cargarPlanillasGuardadas() {
    const tbody = document.getElementById('tabla-planillas-body');
    if (!tbody) return;

    // Usamos onSnapshot para que se actualice en tiempo real sin recargar la página
    db.collection('planillas').orderBy('fechaCreacion', 'desc').onSnapshot(snapshot => {
        let html = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">No hay planillas históricas guardadas.</td></tr>';
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
    if (confirm("⚠️ ATENCIÓN: Esta acción eliminará el registro histórico de esta planilla de forma definitiva. ¿Deseas continuar?")) {
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
        alert("Ocurrió un error al descargar.");
    }
}

// --- FUNCIONES PARA EDITAR HORAS ---

function abrirModalEdicion(id) {
    const data = window.datosEdicion && window.datosEdicion[id];
    if (!data) {
        alert("No se encontró la información local del registro. Por favor, recarga la página.");
        return;
    }

    document.getElementById('edit-id').value = id;
    if (document.getElementById('edit-nombre')) document.getElementById('edit-nombre').value = data.nombre || '';
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
    const horas = parseFloat(document.getElementById('edit-horas').value);
    const motivo = document.getElementById('edit-motivo').value;

    if (!id || isNaN(horas)) {
        return alert("Por favor, ingresa una cantidad de horas válida.");
    }

    try {
        const updateData = {
            horasTotales: horas,
            comentariosEdit: motivo
        };
        if (nombre !== null) { 
            updateData.nombre = nombre;
        }
        
        await db.collection('asistencias').doc(id).update(updateData);
        
        const modalElement = document.getElementById('modalEditarHora');
        const myModal = bootstrap.Modal.getInstance(modalElement);
        myModal.hide(); // Cerrar el modal

        alert("Edición guardada correctamente.");
        cargarReporteAsistencias(); // Refrescar la tabla
    } catch (error) {
        console.error("Error al editar:", error);
        alert("No se pudo guardar la edición. Revisa tu conexión y permisos.");
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

    // 1. Obtener fechas únicas (ignorar la hora para unificar por día)
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
                const mods = Array.from(dia.modalidades).join('/'); // si tuviera TP y TT en un día mostrará TP/TT
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

    let csv = "\ufeff"; // BOM para correcta codificación en Excel de Tildes y Ñ
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

// --- AUTENTICACIÓN DEL ADMINISTRADOR ---

auth.onAuthStateChanged(user => {
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    
    // Verificamos si estamos en admin.html (donde existen estos contenedores)
    if (loginContainer && dashboardContainer) {
        if (user) {
            loginContainer.style.display = 'none';
            dashboardContainer.style.display = 'block';
            cargarReporteAsistencias(); // Solo cargamos los datos si inició sesión
            cargarPlanillasGuardadas(); // Carga el histórico de auditoría
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
        errorMsg.innerText = "Correo o contraseña incorrectos.";
    }
}

function logoutAdmin() {
    auth.signOut();
}