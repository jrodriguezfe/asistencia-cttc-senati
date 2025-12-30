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



document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('welcome-msg')) {
        document.getElementById('welcome-msg').innerText = `Hola, ${docenteNombre}`;
    }
});

// FUNCIONES DE MARCACIÓN
async function startSession() {
    if (!docenteUID) return alert("Error: No se detectó identidad del docente.");
    
    startTime = new Date();
    const nuevaAsistencia = {
        uid: docenteUID,
        nombre: docenteNombre,
        inicio: firebase.firestore.FieldValue.serverTimestamp(),
        estado: "activo",
        nombreCurso: "", 
        nrc: "",
        temaDictado: "",
        urlEvidencia: ""
    };

    try {
        const docRef = await db.collection('asistencias').add(nuevaAsistencia);
        currentAsistenciaId = docRef.id;
        
        document.getElementById('start-zone').style.display = 'none';
        document.getElementById('end-zone').style.display = 'block';
        
        iniciarCronometro();
    } catch (e) { console.error("Detalle del error:", e);
        alert("Error al iniciar jornada: " + e.message);}
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
        alert(`Jornada finalizada: ${diffHrs} horas registradas para el curso ${curso}.`);
        location.reload();
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Error al registrar la sesión: " + error.message);
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
            if (a.estado === "finalizado") {
                const fechaObj = a.inicio ? a.inicio.toDate() : null;
                const fechaISO = fechaObj ? fechaObj.toISOString().split('T')[0] : '';
                
                // Filtros
                let cumpleNombre = a.nombre.toLowerCase().includes(filtroNombre);
                let cumpleDesde = filtroDesde ? (fechaISO >= filtroDesde) : true;
                let cumpleHasta = filtroHasta ? (fechaISO <= filtroHasta) : true;

                if (cumpleNombre && cumpleDesde && cumpleHasta) {
                    sumaTotal += a.horasTotales;
                    
                    // Lógica para mostrar los checks rápidos
                    const checks = a.checklist || {};
                    const totalChecks = Object.values(checks).filter(v => v === true).length;
                    
                    html += `<tr>
                        <td>${fechaObj ? fechaObj.toLocaleDateString() : '---'}</td>
                        <td><strong>${a.nombre}</strong></td>
                        <td>
                            <small class="d-block fw-bold">${a.nombreCurso || 'N/A'}</small>
                            <span class="badge bg-secondary">NRC: ${a.nrc || '---'}</span>
                        </td>
                        <td>${a.temaDictado || a.actividad || '---'}</td>
                        <td><span class="badge bg-success">${a.horasTotales.toFixed(2)}</span></td>
                        <td>
                            <span class="text-primary fw-bold">${totalChecks}/6</span> 
                            <i class="bi bi-patch-check-fill text-primary"></i>
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