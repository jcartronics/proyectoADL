// context/CategoriesContext.js
import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axiosConfig.js";

// Estrategia de reintentos: tiempos crecientes para cubrir cold starts (Render u otros)
const CATEGORY_FETCH_TIMEOUTS = [10000, 20000, 30000]; // ms
const MAX_ATTEMPTS = CATEGORY_FETCH_TIMEOUTS.length;

const CategoriesContext = createContext();

export const CategoriesProvider = ({ children }) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWithRetry = async () => {
      setLoading(true);
      setError(null);

      // Cargar cache primero (respuesta rápida)
      const cached = localStorage.getItem("marketplace_categories");
      if (cached && cached !== "undefined") {
        try {
          setCategories(JSON.parse(cached));
        } catch {
          // Ignorar parse error y continuar
        }
      }

      let lastError = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const timeout = CATEGORY_FETCH_TIMEOUTS[attempt - 1];
          const response = await api.get("/categoria", { timeout });
          const newCategories = response.data.categorias || [];
          setCategories(newCategories);
          localStorage.setItem(
            "marketplace_categories",
            JSON.stringify(newCategories)
          );
          lastError = null;
          break; // éxito
        } catch (err) {
          lastError = err;
          const isTimeout = err.code === "ECONNABORTED";
          const isNetwork = !err.response;
          console.warn(
            `Categorías intento ${attempt}/${MAX_ATTEMPTS} fallido`,
            err.message
          );
          // Esperar antes del próximo intento solo si quedan intentos
          if (attempt < MAX_ATTEMPTS && (isTimeout || isNetwork)) {
            // Pequeño backoff exponencial base 500ms
            const delay = 500 * attempt;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          } else {
            break;
          }
        }
      }

      if (lastError) {
        setError(
          lastError.response?.data?.message ||
            `Error cargando categorías. Reintentos: ${MAX_ATTEMPTS}`
        );
        if (!cached) {
          setCategories([]);
        }
        console.error("Categories API error:", lastError);
      }

      setLoading(false);
    };

    fetchWithRetry();
  }, []);

  // Función para forzar recarga (útil cuando se agregan categorías)
  const refreshCategories = async () => {
    try {
      setLoading(true);
      const response = await api.get("/categoria", { timeout: 15000 });
      const newCategories = response.data.categorias || [];
      setCategories(newCategories);
      localStorage.setItem(
        "marketplace_categories",
        JSON.stringify(newCategories)
      );
      return newCategories;
    } catch (err) {
      setError(err.response?.data?.message || "Error actualizando categorías");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    categories,
    loading,
    error,
    refreshCategories,
  };

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
};

export const useCategories = () => {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error("useCategories must be used within CategoriesProvider");
  }
  return context;
};
