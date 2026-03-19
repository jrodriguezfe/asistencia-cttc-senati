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
const docenteDNI = params.get('dni');
const docenteID = params.get('id');

// Verifica en consola si los datos llegan al cargar la página
console.log("Datos recibidos:", { docenteUID, docenteNombre, docenteDNI, docenteID });



// 1. RECUPERACIÓN AUTOMÁTICA AL CARGAR LA PÁGINA
document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('welcome-msg')) {
        document.getElementById('welcome-msg').innerText = `Hola, ${docenteNombre || 'Docente'}`;
    }
    if (document.getElementById('display-dni')) {
        document.getElementById('display-dni').innerText = docenteDNI || 'S/N';
    }
    if (document.getElementById('display-id')) {
        document.getElementById('display-id').innerText = docenteID || 'S/N';
    }
    if (document.getElementById('display-uid')) {
        document.getElementById('display-uid').innerText = docenteUID || 'S/N';
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
        localStorage.removeItem('sesion_startTime');
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

    // 1. Captura de todos los filtros (Asegúrate de tener el input 'filtro-nrc' en tu HTML)
    const filtroNombre = document.getElementById('filtro-nombre').value.toLowerCase();
    const filtroNRC = document.getElementById('filtro-nrc')?.value || ""; 
    const filtroDesde = document.getElementById('filtro-desde').value;
    const filtroHasta = document.getElementById('filtro-hasta').value;

    // Filtros independientes para la matriz
    const matrizDesde = document.getElementById('matriz-desde')?.value || "";
    const matrizHasta = document.getElementById('matriz-hasta')?.value || "";

    db.collection('asistencias').orderBy('inicio', 'desc').get().then(snapshot => {
        let html = '';
        let sumaTotal = 0;
        
        // Variables para el gráfico (opcional)
        let sesionesCompletas = 0;
        let sesionesIncompletas = 0;
        
        let registrosMatriz = []; // Almacenará datos para el cuadro de doble entrada

        snapshot.forEach(doc => {
            const a = doc.data();
            const id = doc.id;

            // 2. Considerar estados de finalización manual y automática
            if (a.estado === "finalizado" || a.estado === "finalizado_auto") {
                const fechaObj = a.inicio ? a.inicio.toDate() : null;
                const fechaISO = fechaObj ? fechaObj.toISOString().split('T')[0] : '';
                
                // 3. Aplicación de Filtros
                let cumpleNombre = a.nombre.toLowerCase().includes(filtroNombre);
                let cumpleNRC = filtroNRC === "" || (a.nrc && a.nrc.includes(filtroNRC));
                let cumpleDesde = filtroDesde ? (fechaISO >= filtroDesde) : true;
                let cumpleHasta = filtroHasta ? (fechaISO <= filtroHasta) : true;

                if (cumpleNombre && cumpleNRC && cumpleDesde && cumpleHasta) {
                    sumaTotal += a.horasTotales;
                    
                    const checks = a.checklist || {};
                    const totalChecks = Object.values(checks).filter(v => v === true).length;
                    if(totalChecks === 6) sesionesCompletas++; else sesionesIncompletas++;

                    // 4. Lógica Visual para Discrepancias y Cierres Auto
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
                            <button class="btn btn-sm btn-warning" onclick="abrirModalEdicion('${id}', ${a.horasTotales}, '${a.comentariosEdit || ''}')">
                                <i class="bi bi-pencil-square"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="eliminarAsistencia('${id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>`;
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

        container.innerHTML = html;
        document.getElementById('total-horas-acumuladas').innerText = sumaTotal.toFixed(2);
        
        // Actualizar contador grande y gráfico si los tienes
        if(document.getElementById('total-horas-grande')) {
            document.getElementById('total-horas-grande').innerText = sumaTotal.toFixed(2);
        }
        if(typeof actualizarGrafico === "function") {
            actualizarGrafico(sesionesCompletas, sesionesIncompletas);
        }
        
        renderizarMatriz(registrosMatriz); // Llama a la generación de la matriz
    });
}


function limpiarFiltros() {
    document.getElementById('filtro-nombre').value = '';
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
    const rows = document.querySelectorAll("#tabla-reportes-body tr");
    // Cabecera actualizada
    let csv = "\ufeffFecha;Docente;ID;DNI;Curso;NRC;Tema;Horas;Cumplimiento\n";
    
    rows.forEach(row => {
        const cols = row.querySelectorAll("td");
        // Extraemos el texto limpio de cada celda
        const fecha = cols[0].innerText;
        
        const docenteNombreEl = cols[1].querySelector('strong');
        const docente = docenteNombreEl ? docenteNombreEl.innerText.trim() : cols[1].innerText.trim();
        const idDocente = cols[2].innerText.trim();
        const dniDocente = cols[3].innerText.trim();
        
        const curso = cols[4].querySelector('small').innerText;
        const nrc = cols[4].querySelector('span').innerText.replace('NRC: ', '');
        const tema = cols[5].innerText;
        const horas = cols[6].innerText;
        const checks = cols[7].innerText;

        csv += `"${fecha}";"${docente}";"${idDocente}";"${dniDocente}";"${curso}";"${nrc}";"${tema}";"${horas}";"${checks}"\n`;
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
        const docenteNombreEl = fila.cells[1].querySelector('strong');
        const nombre = docenteNombreEl ? docenteNombreEl.innerText.trim() : fila.cells[1].innerText.split('\n')[0].trim();
        const horas = parseFloat(fila.cells[6].innerText) || 0;
        
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

// --- FUNCIONES PARA EDITAR HORAS ---

function abrirModalEdicion(id, horas, motivo) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-horas').value = horas;
    document.getElementById('edit-motivo').value = motivo !== 'undefined' ? motivo : '';
    
    // Abrir el modal usando la API de Bootstrap
    const modalElement = document.getElementById('modalEditarHora');
    const myModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    myModal.show();
}

async function guardarEdicionHora() {
    const id = document.getElementById('edit-id').value;
    const horas = parseFloat(document.getElementById('edit-horas').value);
    const motivo = document.getElementById('edit-motivo').value;

    if (!id || isNaN(horas)) {
        return alert("Por favor, ingresa una cantidad de horas válida.");
    }

    try {
        await db.collection('asistencias').doc(id).update({
            horasTotales: horas,
            comentariosEdit: motivo
        });
        
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