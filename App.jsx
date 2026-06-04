import React, { useState } from 'react';

// --- CONFIGURACIÓN DE PAÍSES ---
const PAISES = [
  "Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Costa Rica", "Cuba", 
  "Ecuador", "El Salvador", "España", "Guatemala", "Honduras", "México", 
  "Nicaragua", "Panamá", "Paraguay", "Perú", "Puerto Rico", "República Dominicana", 
  "Uruguay", "Venezuela", "Otro"
];

// --- DATOS INICIALES DEL SIMULADOR DE GOOGLE SHEETS ---
const MOCK_DB_INITIAL = [
  { timestamp: "2026-06-01 10:24", dni: "12345678", especialidad: "Cardiología", pais: "Argentina", experiencia: "11-20", setting: "Hospital público", score: 8.5, nivel: "Alto" },
  { timestamp: "2026-06-01 14:15", dni: "98765432", especialidad: "Neurología", pais: "España", experiencia: "5-10", setting: "Mixto", score: 7.0, nivel: "Intermedio" },
  { timestamp: "2026-06-02 09:05", dni: "45612378", especialidad: "Medicina Interna", pais: "México", experiencia: ">20", setting: "Hospital privado", score: 4.5, nivel: "Intermedio" },
  { timestamp: "2026-06-02 18:40", dni: "78912345", especialidad: "Hematología", pais: "Colombia", experiencia: "<5", setting: "Universidad", score: 9.0, nivel: "Alto" },
  { timestamp: "2026-06-03 11:12", dni: "32165498", especialidad: "Geriatría", pais: "Uruguay", experiencia: ">20", setting: "Consultorio privado", score: 3.0, nivel: "Bajo" }
];

export default function App() {
  // --- ESTADOS DE LA APP ---
  const [currentStep, setCurrentStep] = useState(0); // 0: Bienvenida, 1-5: Secciones, 6: Resultado, 7: DB View
  const [formData, setFormData] = useState({
    // Sección 1
    dni: "",
    especialidad: "",
    pais: "",
    experiencia: "",
    setting: "",
    pacientesAnuales: "",
    // Sección 2
    percepcionConocimiento: "",
    subtiposConocidos: [],
    educacionPrevia: "",
    // Sección 3
    redFlags: [],
    sugestivoATTR: "",
    sugestivoAL: "",
    icfepCase: "",
    neuropatiaCase: "",
    // Sección 4
    descarteAL: [],
    rolGammagrafia: "",
    referenciaATTR: "",
    centroReferencia: "",
    // Sección 5
    frecuenciaSospecha: "",
    derivacionHabitual: "",
    barreraDiagnostico: ""
  });

  const [dbData, setDbData] = useState(MOCK_DB_INITIAL);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [calculatedScore, setCalculatedScore] = useState(0);
  const [scoreLevel, setScoreLevel] = useState("");
  const [showScriptModal, setShowScriptModal] = useState(false);
  
  // Seguridad de la Base de Datos
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [inputPasscode, setInputPasscode] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  
  // Toasts personalizados (reemplazo de alert)
  const [toast, setToast] = useState({ show: false, message: "", type: "info" });

  const triggerToast = (message, type = "info") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
  };

  // --- LOGICA DE PUNTUACIÓN (AKS - Amyloidosis Knowledge Score) ---
  const calculateAKS = (data) => {
    let score = 0;

    // Q10: Hallazgo más sugestivo de ATTR -> Túnel carpiano bilateral (1.5 pts)
    if (data.sugestivoATTR === "Túnel carpiano bilateral") {
      score += 1.5;
    }

    // Q11: Hallazgo más sugestivo de amiloidosis AL -> Macroglosia (1.5 pts)
    if (data.sugestivoAL === "Macroglosia") {
      score += 1.5;
    }

    // Q12: ICFEp e hipertrofia sin HTA -> Siempre o Frecuentemente (1.0 pt)
    if (data.icfepCase === "Siempre" || data.icfepCase === "Frecuentemente") {
      score += 1.0;
    }

    // Q13: Neuropatía axonal progresiva y disautonomía -> Sí (1.0 pt)
    if (data.neuropatiaCase === "Sí") {
      score += 1.0;
    }

    // Q14: Para descartar amiloidosis AL solicitaría -> Inmunofijación sérica + Inmunofijación urinaria + Cadenas livianas libres (2.0 pts)
    const q14Resp = data.descarteAL || [];
    const hasSérica = q14Resp.includes("Inmunofijación sérica");
    const hasUrinaria = q14Resp.includes("Inmunofijación urinaria");
    const hasCadenas = q14Resp.includes("Cadenas livianas libres");
    const hasIncorrect = q14Resp.includes("FAN") || q14Resp.includes("No estoy seguro");
    
    if (hasSérica && hasUrinaria && hasCadenas && !hasIncorrect) {
      score += 2.0;
    } else if ((hasSérica || hasUrinaria || hasCadenas) && !hasIncorrect) {
      const count = [hasSérica, hasUrinaria, hasCadenas].filter(Boolean).length;
      score += count * 0.5; 
    }

    // Q15: Rol de gammagrafía ósea en ATTR -> Confirma ATTR en determinados escenarios clínicos (1.5 pts)
    if (data.rolGammagrafia === "Confirma ATTR en determinados escenarios clínicos") {
      score += 1.5;
    }

    // Q16: Método diagnóstico de referencia para ATTR cardíaca -> Diagnóstico no invasivo posible en escenarios seleccionados (1.5 pts)
    if (data.referenciaATTR === "Diagnóstico no invasivo posible en escenarios seleccionados") {
      score += 1.5;
    }

    return parseFloat(score.toFixed(1));
  };

  const getScoreLevel = (score) => {
    if (score <= 4.0) return "Bajo";
    if (score <= 7.5) return "Intermedio";
    return "Alto";
  };

  // --- MANIPULADORES DE ENTRADA ---
  const handleRadioChange = (question, value) => {
    setFormData(prev => ({ ...prev, [question]: value }));
    if (errors[question]) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[question];
        return newErrs;
      });
    }
  };

  const handleInputChange = (question, value) => {
    setFormData(prev => ({ ...prev, [question]: value }));
    if (errors[question]) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[question];
        return newErrs;
      });
    }
  };

  const handleCheckboxChange = (question, value) => {
    setFormData(prev => {
      const currentValues = prev[question] || [];
      let newValues;
      if (currentValues.includes(value)) {
        newValues = currentValues.filter(v => v !== value);
      } else {
        newValues = [...currentValues, value];
      }
      return { ...prev, [question]: newValues };
    });
  };

  const validateStep = (step) => {
    const errs = {};
    if (step === 1) {
      if (!formData.dni || formData.dni.trim().length < 6) {
        errs.dni = "Ingrese un número de documento válido (mínimo 6 caracteres)";
      }
      if (!formData.especialidad) errs.especialidad = "Seleccione su especialidad";
      if (!formData.pais) errs.pais = "Seleccione su país de ejercicio";
      if (!formData.experiencia) errs.experiencia = "Seleccione sus años de práctica";
      if (!formData.setting) errs.setting = "Seleccione su ámbito de trabajo";
      if (!formData.pacientesAnuales) errs.pacientesAnuales = "Responda la estimación de pacientes";
    } else if (step === 2) {
      if (!formData.percepcionConocimiento) errs.percepcionConocimiento = "Por favor, califique su nivel de conocimiento";
      if (!formData.subtiposConocidos || formData.subtiposConocidos.length === 0) errs.subtiposConocidos = "Seleccione al menos una opción";
      if (!formData.educacionPrevia) errs.educacionPrevia = "Seleccione si ha participado en actividades educativas";
    } else if (step === 3) {
      if (!formData.redFlags || formData.redFlags.length === 0) errs.redFlags = "Seleccione al menos un hallazgo o 'Ninguno'";
      if (!formData.sugestivoATTR) errs.sugestivoATTR = "Seleccione una opción para ATTR";
      if (!formData.sugestivoAL) errs.sugestivoAL = "Seleccione una opción para AL";
      if (!formData.icfepCase) errs.icfepCase = "Responda la consideración clínica de ICFEp";
      if (!formData.neuropatiaCase) errs.neuropatiaCase = "Responda la consideración clínica de neuropatía";
    } else if (step === 4) {
      if (!formData.descarteAL || formData.descarteAL.length === 0) errs.descarteAL = "Seleccione al menos una opción o 'No estoy seguro'";
      if (!formData.rolGammagrafia) errs.rolGammagrafia = "Seleccione una opción sobre el rol de gammagrafía";
      if (!formData.referenciaATTR) errs.referenciaATTR = "Seleccione el método de referencia";
      if (!formData.centroReferencia) errs.centroReferencia = "Responda si conoce un centro de referencia";
    } else if (step === 5) {
      if (!formData.frecuenciaSospecha) errs.frecuenciaSospecha = "Especifique con qué frecuencia sospecha la enfermedad";
      if (!formData.derivacionHabitual) errs.derivacionHabitual = "Seleccione a quién deriva habitualmente";
      if (!formData.barreraDiagnostico) errs.barreraDiagnostico = "Seleccione la principal barrera diagnóstica";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
    window.scrollTo(0, 0);
  };

  const handleOpenDatabase = () => {
    if (isAdminAuthenticated) {
      setCurrentStep(7);
    } else {
      setShowAdminLogin(true);
    }
  };

  const handleAdminVerify = (e) => {
    e.preventDefault();
    if (inputPasscode === "admin123") {
      setIsAdminAuthenticated(true);
      setShowAdminLogin(false);
      setInputPasscode("");
      setCurrentStep(7);
      triggerToast("Acceso de Administrador verificado", "success");
    } else {
      triggerToast("Clave incorrecta. Acceso denegado.", "error");
    }
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) return;

    setIsSubmitting(true);
    const score = calculateAKS(formData);
    const level = getScoreLevel(score);

    setCalculatedScore(score);
    setScoreLevel(level);

    // Guardar fecha y hora
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newRecord = {
      timestamp: formattedDate,
      dni: formData.dni,
      especialidad: formData.especialidad,
      pais: formData.pais,
      experiencia: formData.experiencia,
      setting: formData.setting,
      score: score,
      nivel: level
    };

    // Actualizar base de datos local simulada
    setDbData(prev => [newRecord, ...prev]);

    // Enviar a Webhook real de Google Sheets si está configurado
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...formData,
            timestamp: formattedDate,
            score: score,
            nivel: level
          })
        });
        triggerToast("Datos enviados y registrados con éxito", "success");
      } catch (e) {
        console.error("Error al enviar al Webhook", e);
        triggerToast("Formulario finalizado (guardado localmente)", "info");
      }
    } else {
      triggerToast("Formulario procesado correctamente de forma local", "success");
    }

    setIsSubmitting(false);
    setCurrentStep(6); // Ir a pantalla de resultados
    window.scrollTo(0, 0);
  };

  const exportToCSV = () => {
    const headers = ["Fecha", "DNI", "Especialidad", "País", "Experiencia", "Ámbito", "Score AKS", "Nivel"];
    const rows = dbData.map(r => [
      r.timestamp,
      r.dni,
      r.especialidad,
      r.pais,
      r.experiencia,
      r.setting,
      r.score,
      r.nivel
    ]);

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Amiloidosis_AKS_Resultados_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const restartForm = () => {
    setFormData({
      dni: "",
      especialidad: "",
      pais: "",
      experiencia: "",
      setting: "",
      pacientesAnuales: "",
      percepcionConocimiento: "",
      subtiposConocidos: [],
      educacionPrevia: "",
      redFlags: [],
      sugestivoATTR: "",
      sugestivoAL: "",
      icfepCase: "",
      neuropatiaCase: "",
      descarteAL: [],
      rolGammagrafia: "",
      referenciaATTR: "",
      centroReferencia: "",
      frecuenciaSospecha: "",
      derivacionHabitual: "",
      barreraDiagnostico: ""
    });
    setErrors({});
    setCurrentStep(0);
  };

  // --- CÁLCULO DE MÉTRICAS EN VIVO ---
  const totalSubmissions = dbData.length;
  const avgScore = totalSubmissions > 0 
    ? (dbData.reduce((acc, r) => acc + r.score, 0) / totalSubmissions).toFixed(1) 
    : 0;
  
  const highPercent = totalSubmissions > 0
    ? Math.round((dbData.filter(r => r.nivel === "Alto").length / totalSubmissions) * 100)
    : 0;

  const scriptGoogleSheets = `
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  // Mapear los datos que llegan desde el formulario interactivo
  sheet.appendRow([
    data.timestamp,
    data.dni, // Columna de DNI añadida
    data.especialidad,
    data.pais,
    data.experiencia,
    data.setting,
    data.pacientesAnuales,
    data.percepcionConocimiento,
    data.subtiposConocidos ? data.subtiposConocidos.join(", ") : "",
    data.educacionPrevia,
    data.redFlags ? data.redFlags.join(", ") : "",
    data.sugestivoATTR,
    data.sugestivoAL,
    data.icfepCase,
    data.neuropatiaCase,
    data.descarteAL ? data.descarteAL.join(", ") : "",
    data.rolGammagrafia,
    data.referenciaATTR,
    data.centroReferencia,
    data.frecuenciaSospecha,
    data.derivacionHabitual,
    data.barreraDiagnostico,
    data.score,
    data.nivel
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({result: "success"}))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative">
      
      {/* TOAST NOTIFICATION CONTAINER */}
      {toast.show && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 border ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-900 border-emerald-200" :
            toast.type === "error" ? "bg-rose-50 text-rose-900 border-rose-200" :
            "bg-blue-50 text-blue-900 border-blue-200"
          }`}>
            <span className="text-base font-bold">
              {toast.type === "success" ? "✓" : toast.type === "error" ? "⚠" : "ℹ"}
            </span>
            <p className="text-sm font-semibold">{toast.message}</p>
          </div>
        </div>
      )}

      {/* HEADER DE LA APP */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-200">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Portal de Amiloidosis</h1>
              <p className="text-xs text-slate-500 font-medium">Evaluación Médica Interactiva • AKS</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenDatabase}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center gap-2 border ${
                currentStep === 7 
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Base de Datos
              {isAdminAuthenticated && (
                <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold ml-1">
                  {dbData.length}
                </span>
              )}
            </button>
            
            {currentStep > 0 && currentStep < 6 && (
              <button 
                onClick={restartForm}
                className="px-3.5 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-lg transition-colors"
              >
                Reiniciar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* CUERPO PRINCIPAL */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* PROGRESS BAR */}
        {currentStep > 0 && currentStep <= 5 && (
          <div className="mb-8 bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              <span>Sección {currentStep} de 5</span>
              <span>{Math.round((currentStep / 5) * 100)}% Completado</span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(currentStep / 5) * 100}%` }}
              ></div>
            </div>
            <div className="grid grid-cols-5 gap-1 mt-3 text-center text-[10px] font-bold text-slate-400">
              <span className={currentStep >= 1 ? "text-blue-600" : ""}>1. Perfil</span>
              <span className={currentStep >= 2 ? "text-blue-600" : ""}>2. Percepción</span>
              <span className={currentStep >= 3 ? "text-blue-600" : ""}>3. Red Flags</span>
              <span className={currentStep >= 4 ? "text-blue-600" : ""}>4. Diagnóstico</span>
              <span className={currentStep >= 5 ? "text-blue-600" : ""}>5. Práctica</span>
            </div>
          </div>
        )}

        {/* CONTENEDOR DE TARJETAS PRINCIPAL */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-10 transition-all duration-200">
          
          {/* STEP 0: BIENVENIDA */}
          {currentStep === 0 && (
            <div className="text-center py-4">
              <div className="inline-flex p-4 bg-blue-50 text-blue-700 rounded-3xl mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-12 h-12">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-.621-.504-1.125-1.125-1.125H9.75M8.25 21h8.25a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 16.5 3H7.5A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21ZM9 9h6.75" />
                </svg>
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
                Cuestionario Diagnóstico sobre Amiloidosis
              </h2>
              <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Herramienta clínica diseñada para evaluar y mapear el nivel de sospecha, reconocimiento de "red flags" y conocimiento sobre amiloidosis en profesionales de la salud.
              </p>

              <div className="mt-8 grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                  <span className="text-blue-600 font-bold text-xl">8-10 min</span>
                  <span className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">Duración</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                  <span className="text-blue-600 font-bold text-xl">20 Reactivos</span>
                  <span className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">5 Secciones</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center">
                  <span className="text-blue-600 font-bold text-xl">DNI Control</span>
                  <span className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">Evita Duplicados</span>
                </div>
              </div>

              <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all text-base"
                >
                  Comenzar Evaluación
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: CARACTERÍSTICAS DEL PARTICIPANTE */}
          {currentStep === 1 && (
            <div>
              <div className="mb-6">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">Sección 1</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-3">Características del participante</h3>
                <p className="text-sm text-slate-500 mt-1">Conozcamos un poco sobre su perfil clínico, demográfico e identidad.</p>
              </div>

              <div className="space-y-6">
                {/* NUEVO: DNI Identificador */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-1">Documento de Identidad (DNI / Cédula / Pasaporte)</label>
                  <p className="text-xs text-slate-500 mb-3 font-semibold">Este identificador único se utiliza únicamente para el control de envíos dobles y repetidos en el estudio.</p>
                  <input
                    type="text"
                    placeholder="Escriba su número de documento sin puntos ni espacios"
                    className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.dni}
                    onChange={(e) => handleInputChange("dni", e.target.value)}
                  />
                  {errors.dni && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.dni}</p>}
                </div>

                {/* Q1: Especialidad */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">1. Especialidad</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {["Neurología", "Cardiología", "Medicina Interna", "Hematología", "Reumatología", "Geriatría", "Otra"].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.especialidad === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="especialidad" 
                          className="w-4.5 h-4.5 text-blue-600 focus:ring-blue-500"
                          checked={formData.especialidad === item}
                          onChange={() => handleRadioChange("especialidad", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.especialidad && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.especialidad}</p>}
                </div>

                {/* Q2: País */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">2. País de ejercicio profesional</label>
                  <select
                    className="w-full bg-white border border-slate-200 rounded-xl p-3.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.pais}
                    onChange={(e) => handleRadioChange("pais", e.target.value)}
                  >
                    <option value="">Seleccione su país...</option>
                    {PAISES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {errors.pais && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.pais}</p>}
                </div>

                {/* Q3: Años de práctica */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">3. Años de práctica profesional</label>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    {["<5", "5-10", "11-20", ">20"].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all justify-center ${
                        formData.experiencia === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="experiencia" 
                          className="sr-only"
                          checked={formData.experiencia === item}
                          onChange={() => handleRadioChange("experiencia", item)}
                        />
                        <span className="font-bold text-sm">{item} años</span>
                      </label>
                    ))}
                  </div>
                  {errors.experiencia && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.experiencia}</p>}
                </div>

                {/* Q4: Ámbito principal de trabajo */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">4. Ámbito principal de trabajo</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {["Hospital público", "Hospital privado", "Universidad", "Consultorio privado", "Mixto"].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.setting === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="setting" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.setting === item}
                          onChange={() => handleRadioChange("setting", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.setting && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.setting}</p>}
                </div>

                {/* Q5: Número de pacientes */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">5. ¿Cuántos pacientes con amiloidosis ha atendido en los últimos 12 meses?</label>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    {["Ninguno", "1-5", "6-10", ">10"].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all justify-center ${
                        formData.pacientesAnuales === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="pacientesAnuales" 
                          className="sr-only"
                          checked={formData.pacientesAnuales === item}
                          onChange={() => handleRadioChange("pacientesAnuales", item)}
                        />
                        <span className="font-bold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.pacientesAnuales && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.pacientesAnuales}</p>}
                </div>
              </div>

              {/* ACCIONES DE NAVEGACIÓN */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={handleNext}
                  className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  Siguiente
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: PERCEPCIÓN DE CONOCIMIENTO */}
          {currentStep === 2 && (
            <div>
              <div className="mb-6">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">Sección 2</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-3">Percepción de conocimiento</h3>
                <p className="text-sm text-slate-500 mt-1">Autoevalúe su familiaridad general con la amiloidosis.</p>
              </div>

              <div className="space-y-6">
                {/* Q6: Escala Likert */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">6. ¿Cómo calificaría su conocimiento sobre amiloidosis?</label>
                  <div className="flex flex-col md:flex-row justify-between items-stretch gap-2.5 mt-3">
                    {[
                      { val: "1", lbl: "Muy bajo" },
                      { val: "2", lbl: "Bajo" },
                      { val: "3", lbl: "Intermedio" },
                      { val: "4", lbl: "Bueno" },
                      { val: "5", lbl: "Muy bueno" }
                    ].map(item => (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => handleRadioChange("percepcionConocimiento", item.val)}
                        className={`flex-1 p-4 rounded-xl border font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                          formData.percepcionConocimiento === item.val
                            ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100 scale-102"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span className="text-lg">{item.val}</span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider ${formData.percepcionConocimiento === item.val ? 'text-blue-100' : 'text-slate-400'}`}>
                          {item.lbl}
                        </span>
                      </button>
                    ))}
                  </div>
                  {errors.percepcionConocimiento && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.percepcionConocimiento}</p>}
                </div>

                {/* Q7: Subtipos que conoce */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900">7. ¿Qué subtipos conoce?</label>
                  <p className="text-xs text-slate-500 mb-3 font-semibold">(Múltiple respuesta)</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {["AL", "ATTR hereditaria", "ATTR wild-type", "AA", "No estoy seguro"].map(subtipo => (
                      <label key={subtipo} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.subtiposConocidos?.includes(subtipo)
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input
                          type="checkbox"
                          className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5 border-slate-300"
                          checked={formData.subtiposConocidos?.includes(subtipo)}
                          onChange={() => handleCheckboxChange("subtiposConocidos", subtipo)}
                        />
                        <span className="font-semibold text-sm">{subtipo}</span>
                      </label>
                    ))}
                  </div>
                  {errors.subtiposConocidos && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.subtiposConocidos}</p>}
                </div>

                {/* Q8: Actividad educativa */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">8. ¿Ha participado en alguna actividad educativa sobre amiloidosis en los últimos 3 años?</label>
                  <div className="flex gap-4">
                    {["Sí", "No"].map(item => (
                      <label key={item} className={`flex-1 flex items-center justify-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.educacionPrevia === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="educacionPrevia" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.educacionPrevia === item}
                          onChange={() => handleRadioChange("educacionPrevia", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.educacionPrevia && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.educacionPrevia}</p>}
                </div>
              </div>

              {/* ACCIONES DE NAVEGACIÓN */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between gap-3">
                <button
                  onClick={handleBack}
                  className="px-5 py-3 bg-white text-slate-700 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Atrás
                </button>
                <button
                  onClick={handleNext}
                  className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  Siguiente
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: RECONOCIMIENTO DE "RED FLAGS" (DIAM-ATTR) */}
          {currentStep === 3 && (
            <div>
              <div className="mb-6">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">Sección 3</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-3">Reconocimiento de "red flags" (Claves Clínicas)</h3>
                <p className="text-sm text-slate-500 mt-1">Inspirado directamente en los criterios validados de DIAM-ATTR.</p>
              </div>

              <div className="space-y-6">
                {/* Q9: Red flags (Múltiple) */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900">9. ¿Cuáles de los siguientes hallazgos le harían sospechar amiloidosis?</label>
                  <p className="text-xs text-slate-500 mb-3 font-semibold">(Múltiple respuesta)</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      "Túnel carpiano bilateral",
                      "Rotura espontánea del tendón distal del bíceps",
                      "Estenosis lumbar",
                      "Miocardiopatía hipertrófica aparente en >65 años",
                      "Neuropatía sensitivo-motora progresiva",
                      "Disautonomía",
                      "Macroglosia",
                      "Proteinuria inexplicada",
                      "Ninguno de los anteriores"
                    ].map(flag => (
                      <label key={flag} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.redFlags?.includes(flag)
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input
                          type="checkbox"
                          className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5 border-slate-300"
                          checked={formData.redFlags?.includes(flag)}
                          onChange={() => handleCheckboxChange("redFlags", flag)}
                        />
                        <span className="font-semibold text-xs.5 leading-tight">{flag}</span>
                      </label>
                    ))}
                  </div>
                  {errors.redFlags && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.redFlags}</p>}
                </div>

                {/* Q10: Sugestivo ATTR */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-base font-bold text-slate-900">10. ¿Cuál considera el hallazgo más sugestivo de ATTR?</label>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider">Puntuable AKS</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {["Hipertensión arterial", "Túnel carpiano bilateral", "Migraña", "Asma"].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.sugestivoATTR === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="sugestivoATTR" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.sugestivoATTR === item}
                          onChange={() => handleRadioChange("sugestivoATTR", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.sugestivoATTR && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.sugestivoATTR}</p>}
                </div>

                {/* Q11: Sugestivo AL */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-base font-bold text-slate-900">11. ¿Cuál considera el hallazgo más sugestivo de amiloidosis AL?</label>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider">Puntuable AKS</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {["Macroglosia", "Cefalea", "Artritis reumatoidea", "Hipotiroidismo"].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.sugestivoAL === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="sugestivoAL" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.sugestivoAL === item}
                          onChange={() => handleRadioChange("sugestivoAL", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.sugestivoAL && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.sugestivoAL}</p>}
                </div>

                {/* Q12: Caso clínico 1 */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <label className="block text-base font-bold text-slate-900">12. Escenario Clínico A</label>
                      <p className="text-xs text-slate-500 mt-0.5">Paciente de 72 años con ICFEp e hipertrofia ventricular izquierda sin HTA significativa. ¿Consideraría amiloidosis en el diagnóstico diferencial?</p>
                    </div>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider self-start shrink-0">Puntuable AKS</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-4">
                    {["Siempre", "Frecuentemente", "Ocasionalmente", "Rara vez", "Nunca"].map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleRadioChange("icfepCase", item)}
                        className={`p-3 rounded-xl border font-semibold text-xs flex flex-col items-center justify-center text-center transition-all ${
                          formData.icfepCase === item
                            ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100 scale-102"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  {errors.icfepCase && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.icfepCase}</p>}
                </div>

                {/* Q13: Caso clínico 2 */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <label className="block text-base font-bold text-slate-900">13. Escenario Clínico B</label>
                      <p className="text-xs text-slate-500 mt-0.5">Paciente con neuropatía axonal progresiva y disautonomía. ¿Consideraría ATTR hereditaria?</p>
                    </div>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider self-start shrink-0">Puntuable AKS</span>
                  </div>
                  <div className="flex gap-4 mt-4">
                    {["Sí", "No"].map(item => (
                      <label key={item} className={`flex-1 flex items-center justify-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.neuropatiaCase === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="neuropatiaCase" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.neuropatiaCase === item}
                          onChange={() => handleRadioChange("neuropatiaCase", item)}
                        />
                        <span className="font-bold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.neuropatiaCase && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.neuropatiaCase}</p>}
                </div>
              </div>

              {/* ACCIONES DE NAVEGACIÓN */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between gap-3">
                <button
                  onClick={handleBack}
                  className="px-5 py-3 bg-white text-slate-700 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Atrás
                </button>
                <button
                  onClick={handleNext}
                  className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  Siguiente
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: CONOCIMIENTO DIAGNÓSTICO */}
          {currentStep === 4 && (
            <div>
              <div className="mb-6">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">Sección 4</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-3">Conocimiento diagnóstico</h3>
                <p className="text-sm text-slate-500 mt-1">Evaluación de las estrategias diagnósticas de referencia actuales.</p>
              </div>

              <div className="space-y-6">
                {/* Q14: Para descartar AL */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <label className="block text-base font-bold text-slate-900">14. Para descartar amiloidosis AL solicitaría:</label>
                      <p className="text-xs text-slate-500 font-semibold">(Múltiple respuesta)</p>
                    </div>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider shrink-0">Puntuable AKS</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                    {["Inmunofijación sérica", "Inmunofijación urinaria", "Cadenas livianas libres", "FAN", "No estoy seguro"].map(opcion => (
                      <label key={opcion} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.descarteAL?.includes(opcion)
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input
                          type="checkbox"
                          className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5 border-slate-300"
                          checked={formData.descarteAL?.includes(opcion)}
                          onChange={() => handleCheckboxChange("descarteAL", opcion)}
                        />
                        <span className="font-semibold text-sm">{opcion}</span>
                      </label>
                    ))}
                  </div>
                  {errors.descarteAL && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.descarteAL}</p>}
                </div>

                {/* Q15: Rol Gammagrafía */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-base font-bold text-slate-900">15. ¿Cuál es el rol de la gammagrafía ósea con PYP/DPD/HMDP en ATTR?</label>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider self-start shrink-0">Puntuable AKS</span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      "Confirma ATTR en determinados escenarios clínicos",
                      "No tiene utilidad",
                      "Solo sirve para AL",
                      "No estoy seguro"
                    ].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.rolGammagrafia === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="rolGammagrafia" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.rolGammagrafia === item}
                          onChange={() => handleRadioChange("rolGammagrafia", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.rolGammagrafia && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.rolGammagrafia}</p>}
                </div>

                {/* Q16: Método de referencia ATTR */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-base font-bold text-slate-900">16. ¿Cuál considera actualmente el método diagnóstico de referencia para ATTR cardíaca?</label>
                    <span className="bg-yellow-100 text-yellow-800 text-[10px] font-extrabold px-2 py-1 rounded-full uppercase tracking-wider self-start shrink-0">Puntuable AKS</span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      "Biopsia obligatoria en todos los casos",
                      "Diagnóstico no invasivo posible en escenarios seleccionados",
                      "ECG",
                      "Radiografía de tórax"
                    ].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.referenciaATTR === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="referenciaATTR" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.referenciaATTR === item}
                          onChange={() => handleRadioChange("referenciaATTR", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.referenciaATTR && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.referenciaATTR}</p>}
                </div>

                {/* Q17: Centro de Referencia */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">17. ¿Conoce algún centro de referencia para amiloidosis en su país?</label>
                  <div className="flex gap-4">
                    {["Sí", "No"].map(item => (
                      <label key={item} className={`flex-1 flex items-center justify-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.centroReferencia === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="centroReferencia" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.centroReferencia === item}
                          onChange={() => handleRadioChange("centroReferencia", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.centroReferencia && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.centroReferencia}</p>}
                </div>
              </div>

              {/* ACCIONES DE NAVEGACIÓN */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between gap-3">
                <button
                  onClick={handleBack}
                  className="px-5 py-3 bg-white text-slate-700 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Atrás
                </button>
                <button
                  onClick={handleNext}
                  className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  Siguiente
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: PRÁCTICA CLÍNICA */}
          {currentStep === 5 && (
            <div>
              <div className="mb-6">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-full">Sección 5</span>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-3">Práctica clínica diaria</h3>
                <p className="text-sm text-slate-500 mt-1">Cómo se aborda la amiloidosis en su entorno médico habitual.</p>
              </div>

              <div className="space-y-6">
                {/* Q18: Frecuencia de sospecha */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-start mb-3">
                    <label className="block text-base font-bold text-slate-900 leading-tight">18. ¿Con qué frecuencia sospecha amiloidosis en su práctica?</label>
                    <span className="bg-slate-200 text-slate-700 text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shrink-0">Estudio JACC</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      "Nunca", 
                      "Menos de una vez por mes", 
                      "1-5 veces por mes", 
                      ">5 veces por mes"
                    ].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.frecuenciaSospecha === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="frecuenciaSospecha" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.frecuenciaSospecha === item}
                          onChange={() => handleRadioChange("frecuenciaSospecha", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.frecuenciaSospecha && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.frecuenciaSospecha}</p>}
                </div>

                {/* Q19: Derivación */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">19. Cuando sospecha amiloidosis, ¿a quién deriva habitualmente?</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      "Cardiólogo", 
                      "Neurólogo", 
                      "Hematólogo", 
                      "Centro especializado", 
                      "No derivo"
                    ].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.derivacionHabitual === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="derivacionHabitual" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.derivacionHabitual === item}
                          onChange={() => handleRadioChange("derivacionHabitual", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.derivacionHabitual && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.derivacionHabitual}</p>}
                </div>

                {/* Q20: Principal barrera */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="block text-base font-bold text-slate-900 mb-3">20. Principal barrera para el diagnóstico precoz</label>
                  <div className="space-y-2.5">
                    {[
                      "Falta de conocimiento",
                      "Baja sospecha clínica",
                      "Acceso limitado a gammagrafía",
                      "Acceso limitado a genética",
                      "Acceso limitado a especialistas",
                      "Costos",
                      "Otra"
                    ].map(item => (
                      <label key={item} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        formData.barreraDiagnostico === item 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-300' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}>
                        <input 
                          type="radio" 
                          name="barreraDiagnostico" 
                          className="w-4.5 h-4.5 text-blue-600"
                          checked={formData.barreraDiagnostico === item}
                          onChange={() => handleRadioChange("barreraDiagnostico", item)}
                        />
                        <span className="font-semibold text-sm">{item}</span>
                      </label>
                    ))}
                  </div>
                  {errors.barreraDiagnostico && <p className="text-rose-600 text-xs mt-2 font-bold flex items-center gap-1">⚠ {errors.barreraDiagnostico}</p>}
                </div>
              </div>

              {/* ACCIONES DE NAVEGACIÓN */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between gap-3">
                <button
                  onClick={handleBack}
                  className="px-5 py-3 bg-white text-slate-700 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                  </svg>
                  Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Procesando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Enviar Formulario
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: RESULTADO (AKS SCORE & EDUCATIVE BREAKDOWN) */}
          {currentStep === 6 && (
            <div className="py-2">
              <div className="text-center">
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full uppercase tracking-widest">Evaluación Finalizada</span>
                <h3 className="text-3xl font-extrabold text-slate-900 mt-4">Su Resultado Diagnóstico</h3>
                <p className="text-sm text-slate-500 mt-1">Nivel de conocimiento en amiloidosis basado en criterios actuales.</p>
              </div>

              {/* MEDIDOR DE PUNTUACIÓN */}
              <div className="my-8 max-w-md mx-auto bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center relative overflow-hidden">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amyloidosis Knowledge Score (AKS)</span>
                
                <div className="mt-4 flex items-baseline justify-center gap-1">
                  <span className="text-6xl font-black text-slate-950 tracking-tight">{calculatedScore}</span>
                  <span className="text-lg text-slate-400 font-semibold">/ 10 pts</span>
                </div>

                <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide shadow-sm" style={{
                  backgroundColor: scoreLevel === "Alto" ? '#ecfdf5' : scoreLevel === "Intermedio" ? '#fef3c7' : '#fff1f2',
                  color: scoreLevel === "Alto" ? '#047857' : scoreLevel === "Intermedio" ? '#b45309' : '#be123c'
                }}>
                  Nivel de Conocimiento {scoreLevel}
                </div>

                {/* BARRA VISUAL DE RANGO */}
                <div className="mt-6 flex gap-1 h-2 rounded-full overflow-hidden bg-slate-200">
                  <div className={`h-full ${calculatedScore <= 4.0 ? 'bg-rose-500' : 'bg-slate-300'}`} style={{ width: '40%' }}></div>
                  <div className={`h-full ${calculatedScore > 4.0 && calculatedScore <= 7.5 ? 'bg-amber-500' : calculatedScore > 7.5 ? 'bg-emerald-500' : 'bg-slate-300'}`} style={{ width: '35%' }}></div>
                  <div className={`h-full ${calculatedScore > 7.5 ? 'bg-emerald-500' : 'bg-slate-300'}`} style={{ width: '25%' }}></div>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                  <span>Bajo (0-4)</span>
                  <span>Intermedio (5-7.5)</span>
                  <span>Alto (8-10)</span>
                </div>
              </div>

              {/* COMPRENSION CLÍNICA / FEEDBACK EDUCATIVO */}
              <div className="mt-8 space-y-4">
                <h4 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Revisión de Conceptos Clave</h4>

                {/* Item 1 */}
                <div className="flex gap-4 p-4 rounded-2xl border border-slate-100 bg-white">
                  <div className={`p-2 rounded-xl text-white h-10 w-10 flex items-center justify-center shrink-0 ${formData.sugestivoATTR === "Túnel carpiano bilateral" ? 'bg-emerald-500' : 'bg-rose-400'}`}>
                    {formData.sugestivoATTR === "Túnel carpiano bilateral" ? "✓" : "✗"}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Clave Diagnóstica ATTR (Pregunta 10)</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">El hallazgo extracardíaco y musculoesquelético más sugestivo de ATTR es el <strong className="text-emerald-700">Túnel carpiano bilateral</strong>.</p>
                    <p className="text-xs text-slate-500 mt-1">Su respuesta: <span className="italic">{formData.sugestivoATTR || "No respondido"}</span></p>
                  </div>
                </div>

                {/* Item 2 */}
                <div className="flex gap-4 p-4 rounded-2xl border border-slate-100 bg-white">
                  <div className={`p-2 rounded-xl text-white h-10 w-10 flex items-center justify-center shrink-0 ${formData.sugestivoAL === "Macroglosia" ? 'bg-emerald-500' : 'bg-rose-400'}`}>
                    {formData.sugestivoAL === "Macroglosia" ? "✓" : "✗"}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Clave Diagnóstica AL (Pregunta 11)</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">El hallazgo clásico y patognomónico más específico de la amiloidosis AL es la <strong className="text-emerald-700">Macroglosia</strong>.</p>
                    <p className="text-xs text-slate-500 mt-1">Su respuesta: <span className="italic">{formData.sugestivoAL || "No respondido"}</span></p>
                  </div>
                </div>

                {/* Item 3 */}
                <div className="flex gap-4 p-4 rounded-2xl border border-slate-100 bg-white">
                  {/* Q14 Check */}
                  {(() => {
                    const hasSérica = formData.descarteAL?.includes("Inmunofijación sérica");
                    const hasUrinaria = formData.descarteAL?.includes("Inmunofijación urinaria");
                    const hasCadenas = formData.descarteAL?.includes("Cadenas livianas libres");
                    const hasIncorrect = formData.descarteAL?.includes("FAN") || formData.descarteAL?.includes("No estoy seguro");
                    const isPerfect = hasSérica && hasUrinaria && hasCadenas && !hasIncorrect;
                    return (
                      <>
                        <div className={`p-2 rounded-xl text-white h-10 w-10 flex items-center justify-center shrink-0 ${isPerfect ? 'bg-emerald-500' : 'bg-rose-400'}`}>
                          {isPerfect ? "✓" : "✗"}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Estrategia Diagnóstica AL (Pregunta 14)</span>
                          <p className="text-sm font-semibold text-slate-800 mt-0.5">Para descartar Amiloidosis AL con un ~99% de sensibilidad, es imperativo solicitar conjuntamente: <strong className="text-emerald-700">Inmunofijación Sérica + Inmunofijación Urinaria + Cadenas Livianas Libres en suero</strong>.</p>
                          <p className="text-xs text-slate-500 mt-1">Su respuesta: <span className="italic">{formData.descarteAL?.join(", ") || "Ninguna"}</span></p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Item 4 */}
                <div className="flex gap-4 p-4 rounded-2xl border border-slate-100 bg-white">
                  <div className={`p-2 rounded-xl text-white h-10 w-10 flex items-center justify-center shrink-0 ${formData.rolGammagrafia === "Confirma ATTR en determinados escenarios clínicos" ? 'bg-emerald-500' : 'bg-rose-400'}`}>
                    {formData.rolGammagrafia === "Confirma ATTR en determinados escenarios clínicos" ? "✓" : "✗"}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Rol de Gammagrafía (Pregunta 15)</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">La gammagrafía con captación de radiotrazador grado 2 o 3 <strong className="text-emerald-700">Confirma ATTR en determinados escenarios clínicos</strong> (ej. descartando componente clonal monoclonal).</p>
                    <p className="text-xs text-slate-500 mt-1">Su respuesta: <span className="italic">{formData.rolGammagrafia || "No respondido"}</span></p>
                  </div>
                </div>

                {/* Item 5 */}
                <div className="flex gap-4 p-4 rounded-2xl border border-slate-100 bg-white">
                  <div className={`p-2 rounded-xl text-white h-10 w-10 flex items-center justify-center shrink-0 ${formData.referenciaATTR === "Diagnóstico no invasivo posible en escenarios seleccionados" ? 'bg-emerald-500' : 'bg-rose-400'}`}>
                    {formData.referenciaATTR === "Diagnóstico no invasivo posible en escenarios seleccionados" ? "✓" : "✗"}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Algoritmo Diagnóstico de Referencia (Pregunta 16)</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">Actualmente, las guías internacionales avalan que el <strong className="text-emerald-700">Diagnóstico no invasivo es posible en escenarios seleccionados</strong> (gammagrafía positiva + ausencia de cadenas livianas clonales).</p>
                    <p className="text-xs text-slate-500 mt-1">Su respuesta: <span className="italic">{formData.referenciaATTR || "No respondido"}</span></p>
                  </div>
                </div>
              </div>

              {/* ACCIONES FINALES */}
              <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={restartForm}
                  className="px-6 py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-colors"
                >
                  Realizar otra Evaluación
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: DB VIEW (SIMULADOR DE GOOGLE SHEETS / EXPORTADOR / CONFIGURADOR DE WEBHOOK) */}
          {currentStep === 7 && (
            <div>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-5 mb-6 gap-4">
                <div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full uppercase tracking-widest">Base de Datos Conectada</span>
                  <h3 className="text-2xl font-extrabold text-slate-900 mt-3">Registro e Integración de Respuestas</h3>
                  <p className="text-sm text-slate-500">Mapee y visualice las respuestas en tiempo real o configure su integración oficial con Google Sheets.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowScriptModal(true)}
                    className="px-4 py-2 text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                    </svg>
                    Código Script Sheets
                  </button>
                  <button
                    onClick={exportToCSV}
                    className="px-4 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Exportar a Excel (CSV)
                  </button>
                </div>
              </div>

              {/* PANEL DE CONTROL DE CONFIGURACIÓN DEL WEBHOOK DE GOOGLE SHEETS */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 mb-8">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
                  Conexión Directa a Google Sheets (Opcional)
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Para guardar automáticamente las respuestas en tu hoja de Google Sheets real, despliega el código provisto como Web App en Google Apps Script, y pega el URL de ejecución aquí abajo:
                </p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    placeholder="Pega tu URL de Google Apps Script Web App (ej. https://script.google.com/...)"
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      if (webhookUrl) {
                        triggerToast("¡Conexión de Webhook guardada exitosamente!", "success");
                      } else {
                        triggerToast("Ingrese un enlace de webhook de Apps Script válido", "error");
                      }
                    }}
                    className="px-4 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors whitespace-nowrap"
                  >
                    Guardar Integración
                  </button>
                </div>
              </div>

              {/* TARJETAS DE MÉTRICAS GLOBALES */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Respuestas Registradas</span>
                  <span className="text-3xl font-black text-slate-900 mt-1">{totalSubmissions}</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Promedio de Conocimiento (AKS)</span>
                  <span className="text-3xl font-black text-blue-600 mt-1">{avgScore} <span className="text-xs text-slate-400 font-semibold">/ 10</span></span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nivel de Conocimiento Alto</span>
                  <span className="text-3xl font-black text-emerald-600 mt-1">{highPercent}%</span>
                </div>
              </div>

              {/* REPRESENTACIÓN GRÁFICA / TABLA DE REGISTROS AL ESTILO GOOGLE SHEETS */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center text-xs font-bold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-emerald-600 rounded-sm"></span>
                    Amiloidosis_Respuestas_DB.xlsx (Hoja Activa)
                  </span>
                  <span className="text-[10px] text-slate-400">Filas Totales: {dbData.length}</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4 border-r border-slate-200 w-32">Timestamp</th>
                        <th className="py-3 px-4 border-r border-slate-200 w-28">DNI Identificador</th>
                        <th className="py-3 px-4 border-r border-slate-200">Especialidad</th>
                        <th className="py-3 px-4 border-r border-slate-200">País</th>
                        <th className="py-3 px-4 border-r border-slate-200 w-28">Experiencia</th>
                        <th className="py-3 px-4 border-r border-slate-200">Ámbito</th>
                        <th className="py-3 px-4 border-r border-slate-200 text-center w-24">AKS Score</th>
                        <th className="py-3 px-4 text-center w-28">Nivel AKS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                      {dbData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 border-r border-slate-200 text-slate-500 font-semibold">{row.timestamp}</td>
                          <td className="py-3 px-4 border-r border-slate-200 font-mono font-bold text-indigo-700">{row.dni}</td>
                          <td className="py-3 px-4 border-r border-slate-200 font-bold text-slate-900">{row.especialidad}</td>
                          <td className="py-3 px-4 border-r border-slate-200 font-semibold">{row.pais}</td>
                          <td className="py-3 px-4 border-r border-slate-200 text-slate-500">{row.experiencia} años</td>
                          <td className="py-3 px-4 border-r border-slate-200">{row.setting}</td>
                          <td className="py-3 px-4 border-r border-slate-200 text-center font-extrabold text-blue-600 text-sm bg-blue-50/20">{row.score}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-block px-2 py-1.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase" style={{
                              backgroundColor: row.nivel === "Alto" ? '#d1fae5' : row.nivel === "Intermedio" ? '#fef3c7' : '#fee2e2',
                              color: row.nivel === "Alto" ? '#065f46' : row.nivel === "Intermedio" ? '#92400e' : '#991b1b'
                            }}>
                              {row.nivel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* BOTÓN REGRESAR */}
              <div className="mt-8 flex justify-center gap-3">
                <button
                  onClick={() => setIsAdminAuthenticated(false)}
                  className="px-5 py-3 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs rounded-xl transition-all"
                >
                  Cerrar Sesión Admin
                </button>
                <button
                  onClick={() => {
                    if (formData.especialidad) {
                      setCurrentStep(6);
                    } else {
                      setCurrentStep(0);
                    }
                  }}
                  className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all shadow-md text-xs"
                >
                  Regresar al Cuestionario
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* MODAL DE AUTENTICACIÓN ADMIN */}
      {showAdminLogin && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5 text-blue-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Acceso Administrador
            </h3>
            <p className="text-xs text-slate-500 mt-1">La base de datos está restringida para evitar que los participantes vean respuestas ajenas.</p>
            
            <form onSubmit={handleAdminVerify} className="mt-4 space-y-3">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Clave de Acceso</label>
                <input
                  type="password"
                  placeholder="Ingrese la clave maestra"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={inputPasscode}
                  onChange={(e) => setInputPasscode(e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1">Sugerencia de prueba: <span className="font-mono bg-slate-100 px-1 rounded">admin123</span></p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminLogin(false);
                    setInputPasscode("");
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                >
                  Validar Clave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-16 text-center text-xs text-slate-400 font-semibold">
        <p>© 2026 Portal de Amiloidosis. Todos los derechos reservados. AKS Evaluación Médica.</p>
      </footer>

      {/* MODAL COPIAR CÓDIGO SCRIPT GOOGLE SHEETS */}
      {showScriptModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Integrar con Google Sheets</h3>
              <button 
                onClick={() => setShowScriptModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>
            
            <div className="mt-4 overflow-y-auto text-xs.5 leading-relaxed text-slate-600 pr-2">
              <p className="font-semibold text-slate-900">Siga estos pasos para registrar los datos en tiempo real:</p>
              <ol className="list-decimal ml-4 mt-2 space-y-2">
                <li>Abra una nueva hoja en <strong>Google Sheets</strong>.</li>
                <li>Haga clic en <strong>Extensiones</strong> {`>`} <strong>Apps Script</strong>.</li>
                <li>Borre todo el código que aparezca y pegue el código provisto abajo.</li>
                <li>Haga clic en <strong>Implementar</strong> {`>`} <strong>Nueva implementación</strong>.</li>
                <li>Seleccione tipo: <strong>Aplicación web</strong>.</li>
                <li>Configure: "Quién tiene acceso: <strong>Cualquiera</strong>" (muy importante).</li>
                <li>Haga clic en <strong>Implementar</strong>, apruebe los permisos y copie la <strong>URL de la Aplicación web</strong>.</li>
                <li>Pegue esa URL en el panel de Base de Datos de esta aplicación. ¡Listo!</li>
              </ol>

              <div className="mt-4">
                <span className="text-[10px] uppercase font-bold text-slate-400">Código de Google Apps Script:</span>
                <pre className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-[11px] overflow-x-auto mt-1 max-h-56">
                  {scriptGoogleSheets}
                </pre>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(scriptGoogleSheets);
                  triggerToast("¡Código copiado al portapapeles con éxito!", "success");
                }}
                className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 transition-colors"
              >
                Copiar Código
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}