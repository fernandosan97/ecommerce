/**
 * Script de prueba para verificar el control de concurrencia
 * 
 * Este script simula múltiples peticiones simultáneas para crear facturas
 * y verifica que no se venda más stock del disponible.
 * 
 * Uso: node test-concurrency.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Función para crear una factura
async function createInvoice(productId, quantity) {
  try {
    const response = await fetch(`${API_URL}/api/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            productId,
            quantity,
          },
        ],
      }),
    });

    const data = await response.json();
    return { success: response.ok, data, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Función para obtener el stock de un producto
async function getProductStock(productId) {
  try {
    const response = await fetch(`${API_URL}/api/products/${productId}`);
    const data = await response.json();
    return data.stock?.quantity || 0;
  } catch (error) {
    console.error('Error obteniendo stock:', error);
    return null;
  }
}

// Función principal de prueba
async function testConcurrency() {
  console.log('🧪 Iniciando prueba de concurrencia...\n');

  // Primero, necesitas crear un producto y tener su ID
  // Reemplaza este ID con uno real de tu base de datos
  const PRODUCT_ID = process.env.PRODUCT_ID || 'REEMPLAZA_CON_ID_REAL';

  if (PRODUCT_ID === 'REEMPLAZA_CON_ID_REAL') {
    console.log('⚠️  Por favor, configura PRODUCT_ID en las variables de entorno');
    console.log('   Ejemplo: PRODUCT_ID=uuid-del-producto node test-concurrency.js\n');
    return;
  }

  // Obtener stock inicial
  const initialStock = await getProductStock(PRODUCT_ID);
  console.log(`📦 Stock inicial del producto: ${initialStock}\n`);

  if (initialStock === null) {
    console.log('❌ No se pudo obtener el stock del producto');
    return;
  }

  // Cantidad a vender en cada petición
  const quantityPerRequest = 5;
  // Número de peticiones simultáneas
  const numRequests = Math.floor(initialStock / quantityPerRequest) + 2; // Intentar vender más de lo disponible

  console.log(`🔄 Enviando ${numRequests} peticiones simultáneas...`);
  console.log(`   Cada petición intenta vender ${quantityPerRequest} unidades\n`);

  // Crear todas las peticiones simultáneamente
  const promises = Array.from({ length: numRequests }, () =>
    createInvoice(PRODUCT_ID, quantityPerRequest)
  );

  const results = await Promise.all(promises);

  // Analizar resultados
  let successCount = 0;
  let failureCount = 0;
  let insufficientStockCount = 0;
  let concurrencyErrorCount = 0;

  results.forEach((result, index) => {
    if (result.success) {
      successCount++;
      console.log(`✅ Petición ${index + 1}: Factura creada exitosamente`);
    } else {
      failureCount++;
      if (result.status === 400 && result.data?.error === 'Stock insuficiente') {
        insufficientStockCount++;
        console.log(`❌ Petición ${index + 1}: Stock insuficiente`);
      } else if (result.status === 409) {
        concurrencyErrorCount++;
        console.log(`⚠️  Petición ${index + 1}: Error de concurrencia`);
      } else {
        console.log(`❌ Petición ${index + 1}: Error - ${result.error || result.data?.message}`);
      }
    }
  });

  // Obtener stock final
  const finalStock = await getProductStock(PRODUCT_ID);

  console.log('\n📊 Resumen de la prueba:');
  console.log(`   Peticiones exitosas: ${successCount}`);
  console.log(`   Peticiones fallidas: ${failureCount}`);
  console.log(`   - Stock insuficiente: ${insufficientStockCount}`);
  console.log(`   - Errores de concurrencia: ${concurrencyErrorCount}`);
  console.log(`\n📦 Stock final: ${finalStock}`);
  console.log(`   Stock vendido: ${initialStock - finalStock}`);
  console.log(`   Stock esperado vendido: ${successCount * quantityPerRequest}`);

  // Verificar que no se vendió más de lo disponible
  const expectedMaxSold = Math.floor(initialStock / quantityPerRequest) * quantityPerRequest;
  const actualSold = initialStock - finalStock;

  if (actualSold <= initialStock && actualSold === expectedMaxSold) {
    console.log('\n✅ Prueba exitosa: El control de concurrencia funciona correctamente');
    console.log(`   No se vendió más stock del disponible (${initialStock} unidades)`);
  } else if (actualSold > initialStock) {
    console.log('\n❌ Prueba fallida: Se vendió más stock del disponible');
    console.log(`   Stock inicial: ${initialStock}`);
    console.log(`   Stock vendido: ${actualSold}`);
  } else {
    console.log('\n⚠️  Resultado inesperado');
  }
}

// Ejecutar la prueba
testConcurrency().catch(console.error);

