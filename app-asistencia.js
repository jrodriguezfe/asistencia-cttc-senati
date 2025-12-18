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

    db.collection('asistencias').orderBy('inicio', 'desc').get().then(snapshot => {
        let html = '';
        let suma = 0;
        snapshot.forEach(doc => {
            const a = doc.data();
            if (a.estado === "finalizado") {
                suma += a.horasTotales;
                const fecha = a.inicio ? a.inicio.toDate().toLocaleDateString() : '---';
                html += `<tr>
                    <td>${fecha}</td>
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
        });
        container.innerHTML = html;
        document.getElementById('total-horas-acumuladas').innerText = suma.toFixed(2);
    });
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

