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
        actividad: "",
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
    const actividad = document.getElementById('actividad-input').value;
    const evidencia = document.getElementById('evidencia-input').value;

    if (!actividad) return alert("Por favor, describe la actividad realizada.");

    const endTime = new Date();
    const diffHrs = ((endTime - startTime) / (1000 * 60 * 60)).toFixed(2);

    await db.collection('asistencias').doc(currentAsistenciaId).update({
        fin: firebase.firestore.FieldValue.serverTimestamp(),
        horasTotales: parseFloat(diffHrs),
        actividad: actividad,
        urlEvidencia: evidencia,
        estado: "finalizado"
    });

    clearInterval(timerInterval);
    alert(`Jornada finalizada: ${diffHrs} horas registradas.`);
    location.reload();
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

    // Obtener valores de los filtros
    const filtroNombre = document.getElementById('filtro-nombre').value.toLowerCase();
    const filtroDesde = document.getElementById('filtro-desde').value;
    const filtroHasta = document.getElementById('filtro-hasta').value;

    db.collection('asistencias').orderBy('inicio', 'desc').get().then(snapshot => {
        let html = '';
        let suma = 0;

        snapshot.forEach(doc => {
            const a = doc.data();
            if (a.estado === "finalizado") {
                const fechaObj = a.inicio ? a.inicio.toDate() : null;
                const fechaStr = fechaObj ? fechaObj.toLocaleDateString() : '---';
                const fechaISO = fechaObj ? fechaObj.toISOString().split('T')[0] : '';
                
                // Lógica de Filtrado
                let cumpleNombre = a.nombre.toLowerCase().includes(filtroNombre);
                let cumpleDesde = filtroDesde ? (fechaISO >= filtroDesde) : true;
                let cumpleHasta = filtroHasta ? (fechaISO <= filtroHasta) : true;

                if (cumpleNombre && cumpleDesde && cumpleHasta) {
                    suma += a.horasTotales;
                    html += `<tr>
                        <td>${fechaStr}</td>
                        <td><strong>${a.nombre}</strong></td>
                        <td>${a.actividad}</td>
                        <td><span class="badge bg-success">${a.horasTotales.toFixed(2)}</span></td>
                        <td>${a.urlEvidencia ? `<a href="${a.urlEvidencia}" target="_blank">Link</a>` : '---'}</td>
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
        document.getElementById('total-horas-acumuladas').innerText = suma.toFixed(2);
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
    let csv = "\ufeffFecha;Docente;Actividad;Horas;Evidencia\n";
    rows.forEach(row => {
        const cols = row.querySelectorAll("td");
        csv += Array.from(cols).map(c => `"${c.innerText}"`).join(";") + "\n";
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "Reporte_Horas_CTTC.csv";
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