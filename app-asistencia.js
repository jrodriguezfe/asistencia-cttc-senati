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

let timerInterval;
let startTime;
let currentAsistenciaId;
let datosCierreMes = []; // Variable global para guardar el último reporte generado

// Capturar parámetros de la URL enviados desde el Catálogo
const params = new URLSearchParams(window.location.search);
const docenteNombre = params.get('name');
const docenteUID = params.get('uid');

// Verifica en consola si los datos llegan al cargar la página
console.log("Datos recibidos:", { docenteUID, docenteNombre });



// 1. RECUPERACIÓN AUTOMÁTICA AL CARGAR LA PÁGINA
document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('welcome-msg')) {
        document.getElementById('welcome-msg').innerText = `Hola, ${docenteNombre}`;
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

                alert("Tenías una sesión abierta de hace más de 8 horas. Se ha cerrado automáticamente con el límite de tiempo permitido.");
                location.reload();
                return;
            }

            // 3. Si es menor a 8 horas, recuperar normalmente
            currentAsistenciaId = idDoc;
            startTime = inicio;
            
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
    const nuevaAsistencia = {
        uid: docenteUID,
        nombre: docenteNombre,
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


async function endSession() {
    // Captura de campos obligatorios
    const cursoInput = document.getElementById('curso-input');
    const nrcInput = document.getElementById('nrc-input');
    const temaInput = document.getElementById('tema-input');

    // Validación de existencia de elementos para evitar errores en consola
    if (!cursoInput || !nrcInput || !temaInput) {
        return alert("Error técnico: No se encuentran los campos en el HTML. Por favor, limpia la caché (Ctrl+F5).");
    }

    const curso = cursoInput.value;
    const nrc = nrcInput.value;
    const tema = temaInput.value;

    if (!curso || !nrc || !tema) {
        return alert("Por favor, complete los campos obligatorios (Curso, NRC y Tema).");
    }

    const endTime = new Date();
    const diffHrs = ((endTime - startTime) / (1000 * 60 * 60)).toFixed(2);

    // Preparar el objeto de datos con validaciones de existencia (?.value)
    const datosRegistro = {
        fin: firebase.firestore.FieldValue.serverTimestamp(),
        horasTotales: parseFloat(diffHrs),
        nombreCurso: curso,
        nrc: nrc,
        numeroSesion: document.getElementById('sesion-input')?.value || "",
        modalidad: document.getElementById('modalidad-input')?.value || "Presencial",
        temaDictado: tema,
        // Si el campo comentarios no existe en el HTML, guarda vacío en lugar de dar error
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
        alert("Jornada guardada y sincronizada en todos tus dispositivos.");
        location.reload(); 
    } catch (error) {
        alert("Error al finalizar: " + error.message);
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

// FUNCIONES DE ADMINISTRADOR
function cargarReporteAsistencias() {
    const container = document.getElementById('tabla-reportes-body');
    if (!container) return;

    const filtroNombre = document.getElementById('filtro-nombre').value.toLowerCase();
    const filtroDesde = document.getElementById('filtro-desde').value;
    const filtroHasta = document.getElementById('filtro-hasta').value;

    db.collection('asistencias').orderBy('inicio', 'desc').get().then(snapshot => {
        let html = '';
        let sumaTotal = 0;

        snapshot.forEach(doc => {
            const a = doc.data();
            
            // Considerar ambos estados de finalización
            if (a.estado === "finalizado" || a.estado === "finalizado_auto") {
                const fechaObj = a.inicio ? a.inicio.toDate() : null;
                const fechaISO = fechaObj ? fechaObj.toISOString().split('T')[0] : '';
                
                let cumpleNombre = a.nombre.toLowerCase().includes(filtroNombre);
                let cumpleDesde = filtroDesde ? (fechaISO >= filtroDesde) : true;
                let cumpleHasta = filtroHasta ? (fechaISO <= filtroHasta) : true;

                if (cumpleNombre && cumpleDesde && cumpleHasta) {
                    sumaTotal += a.horasTotales;
                    
                    // --- MEJORA VISUAL PARA CIERRE AUTOMÁTICO ---
                    // Pintamos la fila de amarillo si fue cierre automático por la regla de 8h
                    const claseFila = a.estado === "finalizado_auto" ? "table-warning" : "";
                    const iconoAlerta = a.estado === "finalizado_auto" ? 
                        '<i class="bi bi-exclamation-triangle-fill text-danger ms-1" title="Cierre automático (Límite 8h)"></i>' : "";

                    html += `<tr class="${claseFila}">
                        <td>${fechaObj ? fechaObj.toLocaleDateString() : '---'}</td>
                        <td><strong>${a.nombre}</strong> ${iconoAlerta}</td>
                        <td>
                            <small class="d-block fw-bold">${a.nombreCurso || 'N/A'}</small>
                            <span class="badge bg-secondary">NRC: ${a.nrc || '---'}</span>
                        </td>
                        <td>
                            <div class="small"><strong>Tema:</strong> ${a.temaDictado || '---'}</div>
                            <div class="text-muted small" style="font-size: 0.75rem;">${a.comentarios || ''}</div>
                        </td>
                        <td><span class="badge bg-success">${a.horasTotales.toFixed(2)}</span></td>
                        <td>
                            <span class="text-primary fw-bold">${Object.values(a.checklist || {}).filter(v => v === true).length}/6</span>
                        </td>
                        <td>${a.urlEvidencia ? `<a href="${a.urlEvidencia}" target="_blank" class="btn btn-sm btn-link">Ver</a>` : '---'}</td>
                        <td>
                            <button class="btn btn-sm btn-outline-danger" onclick="eliminarAsistencia('${doc.id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>`;
                }
            }
        });
        container.innerHTML = html;
        document.getElementById('total-horas-acumuladas').innerText = sumaTotal.toFixed(2);
    });
}


function limpiarFiltros() {
    document.getElementById('filtro-nombre').value = '';
    document.getElementById('filtro-desde').value = '';
    document.getElementById('filtro-hasta').value = '';
    cargarReporteAsistencias();
}

function exportarExcel() {
    const rows = document.querySelectorAll("#tabla-reportes-body tr");
    // Cabecera actualizada
    let csv = "\ufeffFecha;Docente;Curso;NRC;Tema;Horas;Cumplimiento\n";
    
    rows.forEach(row => {
        const cols = row.querySelectorAll("td");
        // Extraemos el texto limpio de cada celda
        const fecha = cols[0].innerText;
        const docente = cols[1].innerText;
        const curso = cols[2].querySelector('small').innerText;
        const nrc = cols[2].querySelector('span').innerText.replace('NRC: ', '');
        const tema = cols[3].innerText;
        const horas = cols[4].innerText;
        const checks = cols[5].innerText;

        csv += `"${fecha}";"${docente}";"${curso}";"${nrc}";"${tema}";"${horas}";"${checks}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Detallado_CTTC_${new Date().toLocaleDateString()}.csv`;
    link.click();
}

async function eliminarAsistencia(id) {
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

function generarReporteCierreMes() {
    const filas = document.querySelectorAll("#tabla-reportes-body tr");
    const resumen = {};
    datosCierreMes = [];

    if (filas.length === 0) {
        return alert("No hay datos en la tabla. Filtre por fechas primero.");
    }

    // Agrupar horas por docente
    filas.forEach(fila => {
        const nombre = fila.cells[1].innerText;
        const horas = parseFloat(fila.cells[3].innerText) || 0;
        
        if (resumen[nombre]) {
            resumen[nombre] += horas;
        } else {
            resumen[nombre] = horas;
        }
    });

    // Construir tabla del modal
    let html = `
        <table class="table table-bordered">
            <thead class="table-light">
                <tr><th>Docente</th><th class="text-end">Total Horas</th></tr>
            </thead>
            <tbody>`;
    
    for (const docente in resumen) {
        datosCierreMes.push({ docente, horas: resumen[docente].toFixed(2) });
        html += `
            <tr>
                <td>${docente}</td>
                <td class="text-end fw-bold text-success">${resumen[docente].toFixed(2)}</td>
            </tr>`;
    }
    html += `</tbody></table>`;
    
    // Insertar contenido
    document.getElementById('contenido-reporte-cierre').innerHTML = html;

    // FORMA ALTERNATIVA DE ABRIR EL MODAL (Si la anterior falla)
    const modalElement = document.getElementById('modalCierreMes');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();
}

function exportarCierreExcel() {
    if (datosCierreMes.length === 0) return;

    let csv = "\ufeffDocente;Total Horas Acumuladas\n";
    datosCierreMes.forEach(d => {
        csv += `"${d.docente}";"${d.horas}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Cierre_Mes_Asistencia.csv`;
    link.click();
}