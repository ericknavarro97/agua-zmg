#!/usr/bin/env bash
# Pruebas end-to-end de Agua ZMG con agent-browser (navegador real) + curl + SQL.
#
# Requisitos: la app corriendo en E2E_URL contra la base E2E_DB (ver e2e/README.md y e2e/setup.sh),
# con ADMIN_TOKEN = E2E_ADMIN_TOKEN, y agent-browser, docker (psql) y python3 instalados.
# ¡BORRA reportes/rate_limits de E2E_DB! Nunca la apuntes a una base con datos reales.
#
#   bash e2e/run.sh            # todo
#   bash e2e/run.sh api seguridad   # solo esas secciones (nombres en SECCIONES al final)
set -u

URL=${E2E_URL:-http://localhost:3300}
DB=${E2E_DB:-agua_e2e}
PGC=${E2E_PG_CONTAINER:-agua-zmg-db-1}
ADMIN_TOKEN=${E2E_ADMIN_TOKEN:-e2e-admin-token-123456}
APP_DIR=${E2E_APP_DIR:-$(pwd)}
DB_URL=${E2E_DATABASE_URL:-postgres://agua:agua@localhost:5433/$DB}
OUT=${E2E_OUT:-$(pwd)/e2e/resultados}
export AGENT_BROWSER_SESSION=${E2E_SESSION:-e2e}

case "$DB" in *e2e*|*test*|*prueba*) ;; *) echo "Por seguridad E2E_DB debe contener e2e, test o prueba (es: $DB)"; exit 2;; esac

mkdir -p "$OUT/shots"
RES="$OUT/resultados.tsv"; : > "$RES"
PASS=0; FAIL=0; SEC="-"

# ───────────── utilidades ─────────────
sql() { docker exec "$PGC" psql -U agua -d "$DB" -tAc "$1" 2>&1; }
ab() { agent-browser "$@" 2>&1; }
ev() { # eval JS y devuelve el valor ya decodificado
  agent-browser eval "$1" 2>&1 | tail -1 | python3 -c '
import sys, json
s = sys.stdin.read().strip()
try:
    v = json.loads(s)
    print(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
except Exception:
    print(s)'
}
wt() { agent-browser wait --text "$1" >/dev/null 2>&1; }       # espera texto en la página
wl() { agent-browser wait --load networkidle >/dev/null 2>&1; }
ref() { # ref <rol> <prefijo-del-nombre>  -> @eN del primer elemento
  agent-browser snapshot -i 2>/dev/null | grep -F -- "$1 \"$2" | head -1 | sed -E 's/.*ref=(e[0-9]+).*/@\1/'
}
lastref() { agent-browser snapshot -i 2>/dev/null | grep -F -- "$1 \"$2" | tail -1 | sed -E 's/.*ref=(e[0-9]+).*/@\1/'; }
click() { local r; r=$(ref "$1" "$2"); if [ -n "$r" ]; then ab click "$r" >/dev/null; else echo "    (sin elemento: $1 \"$2\")"; return 1; fi; }
shot() { ab screenshot "$OUT/shots/$1.png" >/dev/null; }
txt() { ev 'document.body.innerText'; }
ok() { PASS=$((PASS+1)); printf 'PASS\t%s\t%s\n' "$SEC" "$1" >> "$RES"; echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL\t%s\t%s\t%s\n' "$SEC" "$1" "${2:-}" >> "$RES"; echo "  ✗ $1  -- ${2:-}"; }
eq() { [ "$2" = "$3" ] && ok "$1" || bad "$1" "esperado [$2], obtenido [$3]"; }
has() { case "$3" in *"$2"*) ok "$1";; *) bad "$1" "no contiene [$2] en [${3:0:160}]";; esac; }
nohas() { case "$3" in *"$2"*) bad "$1" "contiene [$2]";; *) ok "$1";; esac; }
re() { if [[ "$3" =~ $2 ]]; then ok "$1"; else bad "$1" "[$3] no cumple /$2/"; fi; }
sec() { SEC="$1"; echo; echo "▶ $1"; }
quiere() { [ $# -eq 0 ] && return 0; local s; for s in "${ARGS[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }
ARGS=("$@")
corre() { [ ${#ARGS[@]} -eq 0 ] && return 0; local s; for s in "${ARGS[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

# POST /api/reportes: post <ip> <user-agent> <json> [origen]; deja el cuerpo en $OUT/body.json y devuelve el código
post() {
  curl -s -o "$OUT/body.json" -D "$OUT/hdr.txt" -w '%{http_code}' -X POST "$URL/api/reportes" \
    -H 'content-type: application/json' -H "origin: ${4:-$URL}" -H 'sec-fetch-site: same-origin' \
    -H "x-forwarded-for: $1" -H "user-agent: $2" -d "$3"
}
nueva_colonia() { sql "SELECT id FROM colonias ORDER BY id OFFSET $1 LIMIT 1"; }
semilla() { # semilla <colonia> <n_reportes> <n_redes> <gravedad> <dias>: reportes visibles de huellas/redes distintas
  sql "INSERT INTO reportes (colonia_id, gravedad, sintomas, huella, red_hash, red_sem, ua_familia, tiempo_ms, canal, creado_en, dia)
       SELECT $1, $4, '{}', 'e2e-h-$1-'||i, 'e2e-r-$1-'||(i % $3), 'e2e-s-$1-'||(i % $3), 'chrome-android', 15000, 'web',
              now() - ((i % $5) * interval '1 day') - (i * interval '37 minutes'), (now() - ((i % $5) * interval '1 day'))::date
       FROM generate_series(1, $2) i" >/dev/null
}

# ───────────── preparación ─────────────
echo "E2E contra $URL  (base $DB)"
curl -s "$URL/api/salud" | grep -q '"ok":true' || { echo "La app no responde en $URL/api/salud"; exit 2; }
sql "DELETE FROM reportes; DELETE FROM rate_limits;" >/dev/null
ab open "$URL" >/dev/null; ab set viewport 1366 800 >/dev/null

# ═════════════ 1. CARGA INICIAL ═════════════
if corre carga; then sec "1. Carga inicial del mapa (escritorio)"
ab open "$URL" >/dev/null; wl
eq "título de la página" "Agua ZMG: mapa ciudadano de la calidad del agua" "$(ev 'document.title')"
eq "h1" "¿Cómo está el agua en tu colonia?" "$(ev 'document.querySelector("h1").innerText')"
eq "lang es-MX" "es-MX" "$(ev 'document.documentElement.lang')"
re "el mapa dibuja un canvas WebGL con tamaño" '^[1-9][0-9]*$' "$(ev '[...document.querySelectorAll("canvas")].filter(c=>c.width>300).length')"
eq "enlace «Saltar al contenido»" "true" "$(ev '!!document.querySelector("a[href=\"#contenido\"]")')"
has "tarjeta explica que sin reportes no hay nivel" "Todavía no hay colonias con nivel publicado" "$(txt)"
has "pie: información ciudadana, no oficial" "Información ciudadana, no oficial" "$(txt)"
re "sin errores de página" '^$' "$(ab errors | tr -d '\n ')"
nivelcons=$(ab console | grep -iE '\[error\]' | grep -viE 'tiles|openfreemap|favicon' | head -3)
[ -z "$nivelcons" ] && ok "sin errores en consola (salvo tiles de terceros)" || bad "errores en consola" "$nivelcons"
shot 01-inicio-escritorio
fi

# ═════════════ 2. BÚSQUEDA ═════════════
if corre busqueda; then sec "2. Búsqueda de colonia"
ab open "$URL" >/dev/null; wl
r=$(ref combobox "Busca tu colonia"); ab fill "$r" "Z" >/dev/null; sleep 0.4
eq "con 1 letra no se despliega la lista" "0" "$(ev 'document.querySelectorAll("[role=listbox] [role=option]").length')"
r=$(ref combobox "Busca tu colonia"); ab fill "$r" "Zona Centro" >/dev/null; sleep 0.5
re "con «Zona Centro» aparecen resultados" '^[1-9]' "$(ev 'document.querySelectorAll("[role=listbox] [role=option]").length')"
click option "Zona Centro" ; sleep 1.5
has "la URL guarda ?colonia=ID" "?colonia=" "$(ab get url)"
has "el panel se abre con el nombre" "Zona Centro" "$(ev 'document.querySelector("h2")?.innerText||""')"
has "el panel dice «Sin datos suficientes»" "Sin datos suficientes" "$(txt)"
shot 02-panel-sin-datos
r=$(ref button "Cerrar información"); ab click "$r" >/dev/null; sleep 0.5
nohas "cerrar el panel quita ?colonia= de la URL" "?colonia=" "$(ab get url)"
r=$(ref combobox "Busca tu colonia"); ab fill "$r" "tonalá centro" >/dev/null; sleep 0.5
re "la búsqueda ignora acentos («tonalá» encuentra «Tonala Centro»)" '^[1-9]' "$(ev 'document.querySelectorAll("[role=listbox] [role=option]").length')"
r=$(ref combobox "Busca tu colonia"); ab fill "$r" "zzzqqqxx" >/dev/null; sleep 0.5
has "sin coincidencias: se anuncia a lectores de pantalla" "No hay colonias con ese nombre" "$(txt)"
eq "sin coincidencias: también hay mensaje VISIBLE para quien ve la pantalla" "true" "$(ev '(()=>{const e=[...document.querySelectorAll("*")].find(n=>n.children.length===0&&/No hay colonias con ese nombre|No encontramos/.test(n.textContent));if(!e)return false;const r=e.getBoundingClientRect();return r.width>8&&r.height>8&&getComputedStyle(e).clip!=="rect(0px, 0px, 0px, 0px)"})()')"
fi

# ═════════════ 3. FILTRO POR MUNICIPIO Y LISTA ═════════════
if corre lista; then sec "3. Filtro por municipio y vista de lista"
ab open "$URL" >/dev/null; wl
r=$(ref combobox "Municipio"); ab select "$r" "Zapopan" >/dev/null; sleep 0.5
click button "Lista"; sleep 1
esperado=$(sql "SELECT count(*) FROM colonias WHERE municipio='Zapopan'")
has "la lista cuenta las colonias de Zapopan de la base ($esperado)" "$esperado colonias en Zapopan" "$(txt)"
re "se muestran filas con botón por colonia" '^[1-9][0-9]*$' "$(ev 'document.querySelectorAll("section ul li button").length')"
has "hay paginación («Mostrar más»)" "Mostrar más" "$(txt)"
shot 03-lista-zapopan
ab click "section ul li button" >/dev/null; sleep 1.2
has "elegir una fila abre el panel (?colonia=)" "?colonia=" "$(ab get url)"
r=$(ref combobox "Municipio"); ab select "$r" "Todos los municipios" >/dev/null; sleep 0.4
total=$(sql "SELECT count(*) FROM colonias ")
has "sin filtro cuenta todas ($total)" "$total colonias" "$(txt)"
click button "Mapa"; sleep 0.8
re "volver a «Mapa» muestra el canvas" '^[1-9]' "$(ev '[...document.querySelectorAll("canvas")].filter(c=>c.width>300).length')"
fi

# ═════════════ 4. ENLACE PROFUNDO Y COMPARTIR ═════════════
if corre compartir; then sec "4. Enlace profundo (?colonia=) y compartir"
id=$(sql "SELECT id FROM colonias WHERE nombre='Zona Centro' AND municipio='Guadalajara' LIMIT 1")
ab open "$URL/?colonia=$id" >/dev/null; wl; sleep 1.5
has "?colonia=ID abre el panel de esa colonia" "Zona Centro" "$(ev 'document.querySelector("h2")?.innerText||""')"
eq "enlace de WhatsApp con la URL de la colonia" "true" "$(ev '[...document.querySelectorAll("a")].some(a=>/wa\.me|api\.whatsapp\.com|whatsapp:\/\//.test(a.href) && decodeURIComponent(a.href).includes("colonia='"$id"'"))')"
has "bloque «Avisa a tus vecinos»" "Avisa a tus vecinos" "$(txt)"
ab open "$URL/?colonia=99999999" >/dev/null; wl; sleep 1
re "?colonia= inexistente no rompe la página" '^[^ ]' "$(ev 'document.querySelector("h1")?.innerText||""')"
re "?colonia=abc no rompe la página" '^[^ ]' "$(ab open "$URL/?colonia=abc" >/dev/null; wl; ev 'document.querySelector("h1")?.innerText||""')"
fi

# ═════════════ 5. DATOS EXTERNOS EN EL PANEL ═════════════
if corre externos; then sec "5. Datos externos (oficiales/ciudadanos) en el panel"
id=$(sql "SELECT colonia_id FROM mediciones_externas WHERE colonia_id IS NOT NULL AND confianza_vinculo='alta' GROUP BY colonia_id ORDER BY count(*) DESC LIMIT 1")
nom=$(sql "SELECT nombre FROM colonias WHERE id=$id")
ab open "$URL/?colonia=$id" >/dev/null; wl; sleep 2
has "el panel de $nom muestra «Reportes publicados»" "Reportes publicados" "$(txt)"
nohas "no dice «sin reportes publicados» cuando sí hay" "No tenemos reportes publicados ligados" "$(txt)"
eq "los datos traen enlace a la fuente (target externo seguro)" "true" "$(ev '[...document.querySelectorAll("a[href^=http]")].some(a=>!a.href.includes("localhost")&&/noopener/.test(a.rel))')"
shot 05-datos-externos

# Capa del mapa «datos externos por colonia» (misma escala de color/trama, pero por cantidad de reportes; sin leyenda propia)
esperadas=$(sql "SELECT count(DISTINCT colonia_id) FROM mediciones_externas WHERE colonia_id IS NOT NULL AND confianza_vinculo IN ('alta','media')")
api_ext=$(curl -s "$URL/api/oficial/colonias")
eq "API de capa: una fila por colonia con vínculo alta/media (no incluye vínculos dudosos)" "$esperadas" "$(echo "$api_ext" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"
eq "API de capa: solo expone id, n y medicion (sin fuentes ni notas)" "id,medicion,n" "$(echo "$api_ext" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(",".join(sorted(d[0])) if d else "")')"
ab open "$URL" >/dev/null; wl; sleep 3
nohas "la leyenda ya no menciona la capa ni «externos»" "xterno" "$(txt)"
eq "no hay casilla de capa en la leyenda" "0" "$(ev 'document.querySelectorAll("section[aria-label=\"Leyenda del mapa\"] input").length')"
has "la leyenda conserva la escala de gravedad" "Lo que reportan" "$(txt)"
re "el mapa sigue sin errores de página con la capa" '^$' "$(ab errors | tr -d '\n ')"
shot 05b-capa-por-cantidad
fi

# ═════════════ 6. REPORTE CIUDADANO DESDE EL NAVEGADOR ═════════════
if corre reporte; then sec "6. Reportar desde el navegador (flujo completo, anti-abuso visible)"
sql "DELETE FROM reportes; DELETE FROM rate_limits;" >/dev/null
c1=$(nueva_colonia 10); c2=$(nueva_colonia 11); c3=$(nueva_colonia 12); c4=$(nueva_colonia 13)
ab open "$URL/?colonia=$c1" >/dev/null; wl; sleep 1.5
eq "el botón de enviar está deshabilitado sin gravedad" "true" "$(ev '[...document.querySelectorAll("button")].find(b=>/Elige cómo llega/.test(b.innerText))?.disabled')"
r=$(ref radio "Moderada"); ab check "$r" >/dev/null 2>&1 || ab click "$r" >/dev/null
click button "Sedimentos"; click button "Mal olor"
ab fill "#comentario" "Sale café. Llámame al 33 1234 5678 o a juan@correo.com" >/dev/null
sleep 2.2
click button "Enviar mi reporte"; wt "Recibimos tu reporte" && ok "confirmación «Recibimos tu reporte»" || bad "confirmación del reporte" "$(txt | head -c 300)"
shot 06-reporte-enviado
eq "se guardó 1 reporte" "1" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c1")"
eq "gravedad 2 y síntomas elegidos" "2|Sedimentos,Mal olor" "$(sql "SELECT gravedad||'|'||array_to_string(sintomas,',') FROM reportes WHERE colonia_id=$c1")"
fila=$(sql "SELECT canal||'|'||sospechoso||'|'||estado||'|'||(tiempo_ms>=2000) FROM reportes WHERE colonia_id=$c1")
eq "canal web, no sospechoso, visible, tiempo humano" "web|false|visible|true" "$fila"
com=$(sql "SELECT comentario FROM reportes WHERE colonia_id=$c1")
nohas "el comentario NO guarda el teléfono" "1234 5678" "$com"
nohas "el comentario NO guarda el correo" "juan@correo.com" "$com"
has "el comentario conserva el resto del texto" "Sale café" "$com"
eq "la tabla reportes no tiene columnas de IP ni de User-Agent completo" "0" "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='reportes' AND column_name ~* '(^ip$|ip_|_ip|direccion|user_?agent$|^ua$)'")"
eq "la huella no contiene la IP ni el UA en claro" "0" "$(sql "SELECT count(*) FROM reportes WHERE huella ~ '127\\.0\\.0\\.1|::1|Mozilla|Chrome'")"

echo "  · reenvío inmediato (cooldown de 30 s)"
ab open "$URL/?colonia=$c1" >/dev/null; wl; sleep 1.5
has "avisa que hoy ya reportó desde este navegador" "Hoy ya enviaste un reporte" "$(txt)"
r=$(ref radio "Grave"); ab click "$r" >/dev/null; sleep 2.2
click button "Enviar mi reporte"; wt "hace unos segundos"
alerta=$(ev 'document.querySelector("[role=alert]")?.innerText||document.querySelector("[role=status]")?.innerText||""')
has "reenviar enseguida muestra el mensaje amable de espera" "hace unos segundos" "$alerta"
eq "no se duplicó el reporte" "1" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c1")"
echo "  · esperando 31 s para corregir el reporte…"; sleep 31
click button "Enviar mi reporte"; wt "actualizamos tu reporte" && ok "tras 30 s el reporte se actualiza" || bad "actualización del reporte" "$(txt | head -c 300)"
eq "sigue siendo 1 reporte y ahora con gravedad 3" "1|3" "$(sql "SELECT count(*)||'|'||max(gravedad) FROM reportes WHERE colonia_id=$c1")"

echo "  · cupo de 3 colonias por día"
for c in $c2 $c3; do
  ab open "$URL/?colonia=$c" >/dev/null; wl; sleep 1.3
  r=$(ref radio "Leve"); ab click "$r" >/dev/null; sleep 2.2; click button "Enviar mi reporte"; wt "Recibimos tu reporte" || true
done
eq "3 colonias distintas aceptadas" "3" "$(sql "SELECT count(DISTINCT colonia_id) FROM reportes")"
ab open "$URL/?colonia=$c4" >/dev/null; wl; sleep 1.3
r=$(ref radio "Leve"); ab click "$r" >/dev/null; sleep 2.2; click button "Enviar mi reporte"; sleep 1.5
has "la 4.ª colonia del día se rechaza con mensaje de límite" "límite de reportes" "$(txt)"
eq "la 4.ª colonia NO se guardó" "0" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c4")"
shot 06-limite-alcanzado
fi

# ═════════════ 7. PUBLICACIÓN DEL NIVEL (agregación) ═════════════
if corre nivel; then sec "7. El color/nivel se publica solo con evidencia suficiente"
sql "DELETE FROM reportes; DELETE FROM rate_limits;" >/dev/null
cA=$(nueva_colonia 20); cB=$(nueva_colonia 21); cC=$(nueva_colonia 22)
semilla "$cA" 30 10 3 3      # 30 reportes, 10 redes, 3 días, gravedad 3  -> publicable, confianza alta
semilla "$cB" 12 12 1 1      # 12 reportes de 12 redes en 1 día, gravedad 1 -> publicable, confianza baja
semilla "$cC" 40 1 4 4       # 40 reportes de UNA sola red -> NO debe publicarse (brigadeo)
echo "  · esperando 32 s: la agregación usa caché stale-while-revalidate (TTL 30 s) y sembré por SQL"
sleep 32; curl -s "$URL/api/colonias/scores" >/dev/null; sleep 3
sc=$(curl -s "$URL/api/colonias/scores")
nA=$(echo "$sc" | python3 -c "import sys,json;d=[x for x in json.load(sys.stdin) if x['id']==$cA];print(d[0]['nivel'] if d else 'no')")
cfA=$(echo "$sc" | python3 -c "import sys,json;d=[x for x in json.load(sys.stdin) if x['id']==$cA];print(d[0]['confianza'] if d else 'no')")
nB=$(echo "$sc" | python3 -c "import sys,json;d=[x for x in json.load(sys.stdin) if x['id']==$cB];print(d[0]['nivel'] if d else 'no')")
cC_=$(echo "$sc" | python3 -c "import sys,json;d=[x for x in json.load(sys.stdin) if x['id']==$cC];print('publicada' if d else 'oculta')")
eq "colonia A (30 rep., 10 redes): nivel 3" "3" "$nA"
eq "colonia A: confianza alta" "alta" "$cfA"
eq "colonia B (12 rep., 12 redes, 1 día): nivel 1" "1" "$nB"
eq "colonia C (40 reportes de UNA red): no se publica" "oculta" "$cC_"
ab open "$URL/?colonia=$cA" >/dev/null; wl; sleep 2
pa=$(ev '(document.querySelector("[aria-label^=\"Información de\"]")?.innerText||"").split("Últimos 30 días")[0]')
has "el resumen del panel de A dice «3. Grave»" "Grave" "$pa"
nohas "el resumen del panel de A ya NO dice «Sin datos suficientes»" "Sin datos suficientes" "$pa"
has "el panel de A muestra la confianza" "onfianza" "$pa"
has "el panel de A tiene serie de 30 días" "Últimos 30 días" "$(txt)"
eq "la serie es un gráfico accesible (svg con título o rol img)" "true" "$(ev '!!document.querySelector("[aria-labelledby=serie-t] svg[role=img], [aria-labelledby=serie-t] svg title, [aria-labelledby=serie-t] svg[aria-label]")')"
shot 07-panel-con-nivel
ab open "$URL/?colonia=$cC" >/dev/null; wl; sleep 1.5
pc=$(ev '(document.querySelector("[aria-label^=\"Información de\"]")?.innerText||"").split("Últimos 30 días")[0]')
has "el panel de C (40 reportes de UNA red) sigue «Sin datos suficientes»" "Sin datos suficientes" "$pc"
ab open "$URL" >/dev/null; wl; sleep 2
re "el resumen cuenta colonias con nivel publicado" 'colonias? con nivel' "$(txt)"
shot 07-mapa-con-niveles
click button "Lista"; sleep 1
r=$(ev 'document.querySelector("section ul li button")?.innerText||""')
has "la lista ordena primero la colonia más grave" "Grave" "$r"
fi

# ═════════════ 8. ESTADOS DE ERROR, OFFLINE Y UBICACIÓN ═════════════
if corre errores; then sec "8. Errores de red, offline y «Mi ubicación»"
ab network route "**/api/colonias/geometria*" --abort >/dev/null
ab open "$URL" >/dev/null; sleep 3
has "si falla la geometría: mensaje claro" "No pudimos cargar las colonias" "$(txt)"
has "ofrece Reintentar" "Reintentar" "$(txt)"
has "ofrece alternativas útiles (qué hacer / denunciar)" "dónde denunciar" "$(txt)"
shot 08-error-geometria
ab network unroute >/dev/null 2>&1
click button "Reintentar"; sleep 3
nohas "tras Reintentar con red sana, el error desaparece" "No pudimos cargar las colonias" "$(txt)"
re "y el mapa vuelve a dibujarse" '^[1-9]' "$(ev '[...document.querySelectorAll("canvas")].filter(c=>c.width>300).length')"

echo "  · scores caídos"
ab network route "**/api/colonias/scores*" --abort >/dev/null
ab open "$URL" >/dev/null; sleep 3
has "si fallan los niveles avisa sin romper el mapa" "No pudimos actualizar los niveles" "$(txt)"
ab network unroute >/dev/null 2>&1

echo "  · formulario sin conexión conserva lo escrito"
c=$(nueva_colonia 30)
ab open "$URL/?colonia=$c" >/dev/null; wl; sleep 1.5
r=$(ref radio "Leve"); ab click "$r" >/dev/null; ab fill "#comentario" "texto que no debe perderse" >/dev/null; sleep 2.2
ab set offline on >/dev/null; click button "Enviar mi reporte"; sleep 1.5
has "offline: mensaje «No pudimos conectarnos»" "No pudimos conectarnos" "$(txt)"
eq "offline: el comentario escrito sigue ahí" "texto que no debe perderse" "$(ev 'document.querySelector("#comentario").value')"
ab set offline off >/dev/null

echo "  · Mi ubicación"
STUB='Object.defineProperty(navigator,"geolocation",{configurable:true,value:{getCurrentPosition:(ok)=>setTimeout(()=>ok({coords:{latitude:LAT,longitude:LNG,accuracy:20}}),50),watchPosition:()=>0,clearWatch:()=>{}}});1'
ab open "$URL" >/dev/null; wl; sleep 1
ab click "button[aria-label^='Usar mi ubicación']" >/dev/null; sleep 3
has "permiso DENEGADO (navegador real): mensaje amable y alternativa" "No diste permiso" "$(txt)"
ab open "$URL" >/dev/null; wl; sleep 1
ab eval "$(echo "$STUB" | sed 's/LAT/20.67667/; s/LNG/-103.3475/')" >/dev/null
ab click "button[aria-label^='Usar mi ubicación']" >/dev/null; sleep 3
has "ubicación SIMULADA en el centro de Guadalajara: abre su colonia" "Estás en Zona Centro" "$(txt)"
has "…y la URL queda con ?colonia=" "?colonia=" "$(ab get url)"
ab open "$URL" >/dev/null; wl; sleep 1
ab eval "$(echo "$STUB" | sed 's/LAT/19.4326/; s/LNG/-99.1332/')" >/dev/null
ab click "button[aria-label^='Usar mi ubicación']" >/dev/null; sleep 3
has "ubicación SIMULADA fuera de la ZMG: mensaje claro" "fuera de la zona metropolitana" "$(txt)"
fi

# ═════════════ 9. PÁGINAS INFORMATIVAS ═════════════
if corre paginas; then sec "9. Páginas informativas (escritorio y móvil)"
for ancho in 1366 390; do
  ab set viewport $ancho 800 >/dev/null
  for p in que-hacer denunciar metodologia datos privacidad acerca; do
    ab open "$URL/$p" >/dev/null; wl
    h1=$(ev 'document.querySelectorAll("h1").length')
    eq "[$ancho] /$p tiene un solo h1" "1" "$h1"
    eq "[$ancho] /$p sin desbordamiento horizontal" "true" "$(ev 'document.documentElement.scrollWidth<=document.documentElement.clientWidth')"
    re "[$ancho] /$p tiene contenido sustancial" '^[0-9]{4,}$' "$(ev 'document.body.innerText.length')"
    has "[$ancho] /$p muestra el aviso «no oficial»" "no oficial" "$(txt)"
    [ $ancho = 390 ] && shot "09-$p-movil" || shot "09-$p-escritorio"
  done
done
ab set viewport 1366 800 >/dev/null
ab open "$URL/que-hacer" >/dev/null; wl; t=$(txt)
has "/que-hacer: aviso de que no sustituye atención médica" "médic" "$t"
has "/que-hacer: indica hervir" "herv" "$t"
re "/que-hacer: declara si fue revisada por un profesional de salud" 'revis' "$t"
ab open "$URL/denunciar" >/dev/null; wl; t=$(txt)
has "/denunciar: menciona la CEDHJ" "CEDHJ" "$t"
has "/denunciar: menciona al SIAPA" "SIAPA" "$t"
ab open "$URL/privacidad" >/dev/null; wl; t=$(txt)
has "/privacidad: menciona la retención de 30 días" "30 días" "$t"
ab open "$URL/datos" >/dev/null; wl; t=$(txt)
has "/datos: documenta la API /api/v1" "/api/v1" "$t"
ab open "$URL/metodologia" >/dev/null; wl; t=$(txt)
has "/metodologia: explica la confianza" "confianza" "$t"
echo "  · navegación"
ab open "$URL" >/dev/null; wl
click link "Qué hacer"; sleep 1; has "la nav lleva a /que-hacer" "/que-hacer" "$(ab get url)"
click link "Denunciar"; sleep 1; has "la nav lleva a /denunciar" "/denunciar" "$(ab get url)"
click link "Mapa"; sleep 1; eq "la nav vuelve al mapa" "$URL/" "$(ab get url)"
ab open "$URL/ruta-que-no-existe" >/dev/null; sleep 1
has "404 amable" "404" "$(ab snapshot 2>/dev/null; txt)"
fi

# ═════════════ 10. MÓVIL ═════════════
if corre movil; then sec "10. Móvil (390×844): panel como hoja inferior"
ab set viewport 390 844 >/dev/null
c=$(sql "SELECT id FROM colonias WHERE nombre='Zona Centro' AND municipio='Guadalajara' LIMIT 1")
ab open "$URL/?colonia=$c" >/dev/null; wl; sleep 2
eq "móvil: sin desbordamiento horizontal" "true" "$(ev 'document.documentElement.scrollWidth<=document.documentElement.clientWidth')"
eq "móvil: el panel ocupa el ancho y queda anclado justo sobre el pie de página" "true" "$(ev '(()=>{const p=document.querySelector("[aria-label^=\"Información de\"]");const f=document.querySelector("footer");if(!p||!f)return false;const r=p.getBoundingClientRect();return r.width>=380&&Math.abs(r.bottom-f.getBoundingClientRect().top)<4})()')"
eq "móvil: botón de reportar con área táctil ≥ 44 px" "true" "$(ev '[...document.querySelectorAll("button")].filter(b=>/Reportar el agua/.test(b.innerText)).every(b=>b.getBoundingClientRect().height>=44)')"
shot 10-movil-panel
click button "Ampliar panel"; sleep 0.6; shot 10-movil-panel-ampliado
ab open "$URL" >/dev/null; wl; sleep 1; click button "Lista"; sleep 1
eq "móvil: la lista no queda tapada por la tarjeta" "true" "$(ev '(()=>{const h=document.querySelector("#lista-t");if(!h)return false;const t=[...document.querySelectorAll("h1")][0].getBoundingClientRect().bottom;return h.getBoundingClientRect().top>=t-2})()')"
shot 10-movil-lista
ab set viewport 1366 800 >/dev/null
fi

# ═════════════ 11. ACCESIBILIDAD BÁSICA ═════════════
if corre a11y; then sec "11. Accesibilidad básica"
ab open "$URL" >/dev/null; wl
eq "todos los botones tienen nombre accesible" "0" "$(ev '[...document.querySelectorAll("button")].filter(b=>!(b.innerText||b.getAttribute("aria-label")||b.title||"").trim()).length')"
eq "todas las imágenes tienen alt" "0" "$(ev '[...document.querySelectorAll("img")].filter(i=>!i.hasAttribute("alt")).length')"
eq "hay landmarks main y nav" "true" "$(ev '!!document.querySelector("main,[role=main]")&&!!document.querySelector("nav")')"
eq "los inputs visibles tienen etiqueta" "0" "$(ev '[...document.querySelectorAll("input:not([type=hidden]),select,textarea")].filter(e=>!e.closest("[inert],[aria-hidden=true]")&&!(e.labels&&e.labels.length)&&!e.getAttribute("aria-label")&&!e.getAttribute("aria-labelledby")).length')"
ab press Tab >/dev/null; ab press Tab >/dev/null
eq "el primer Tab lleva a «Saltar al contenido»" "true" "$(ev '/Saltar/.test(document.activeElement.innerText||"")||/Saltar/.test(document.querySelector("a[href=\"#contenido\"]")?.innerText||"")')"
eq "el foco es visible (outline o ring) en el elemento enfocado" "true" "$(ev '(()=>{const e=document.activeElement;const s=getComputedStyle(e);return s.outlineStyle!="none"||s.boxShadow!="none"})()')"
re "la región en vivo (aria-live) existe para anunciar resultados" '^[1-9]' "$(ev 'document.querySelectorAll("[aria-live]").length')"
ab open "$URL/?colonia=$(nueva_colonia 5)" >/dev/null; wl; sleep 1.5
eq "el formulario oculta el señuelo anti-bots a tecnología asistiva" "true" "$(ev '(()=>{const i=document.querySelector("input[name=referencia_interna]");return !!i&&!!i.closest("[aria-hidden=true]")&&i.tabIndex===-1})()')"
eq "el patrón (no solo el color) distingue los niveles en la leyenda" "true" "$(ev '/Limpia/.test(document.body.innerText)&&/Leve/.test(document.body.innerText)&&/Moderada/.test(document.body.innerText)&&/Grave/.test(document.body.innerText)&&/Crítica/.test(document.body.innerText)')"
fi

# ═════════════ 12. PRIVACIDAD DEL VISITANTE ═════════════
if corre privacidad; then sec "12. Privacidad del visitante"
ab cookies clear >/dev/null 2>&1; ab eval 'localStorage.clear()' >/dev/null 2>&1
ab open "$URL" >/dev/null; wl; sleep 2
eq "un visitante no recibe cookies" "" "$(ev 'document.cookie')"
eq "no se escribe localStorage hasta que reporta" "[]" "$(ev 'JSON.stringify(Object.keys(localStorage))')"
hosts=$(ev 'JSON.stringify([...new Set(performance.getEntriesByType("resource").map(r=>new URL(r.name).host))])')
echo "    hosts contactados: $hosts"
terceros=$(echo "$hosts" | python3 -c 'import sys,json;print(",".join(h for h in json.load(sys.stdin) if "localhost" not in h))')
case "$terceros" in ""|*openfreemap*) ok "solo se contacta al servidor propio y al mapa base ($terceros)";; *) bad "terceros inesperados" "$terceros";; esac
nohas "sin analítica de terceros (google/facebook/hotjar/sentry)" "google" "$hosts"
nohas "sin píxeles de seguimiento" "facebook" "$hosts"
fi

# ═════════════ 13. API PÚBLICA, SALUD Y PWA ═════════════
if corre api; then sec "13. API pública, salud, PWA"
eq "/api/salud responde ok con base" '{"ok":true,"db":true,"version":"0.1.0"}' "$(curl -s "$URL/api/salud")"
n=$(sql "SELECT count(*) FROM colonias ")
eq "geometría trae todas las colonias ($n)" "$n" "$(curl -s "$URL/api/colonias/geometria" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["features"]))')"
nz=$(sql "SELECT count(*) FROM colonias WHERE municipio='Zapopan'")
eq "geometría ?municipio=Zapopan filtra ($nz)" "$nz" "$(curl -s "$URL/api/colonias/geometria?municipio=Zapopan" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["features"]))')"
eq "las propiedades de geometría ya no traen la marca «demo»" "0" "$(curl -s "$URL/api/colonias/geometria" | python3 -c 'import sys,json;print(sum(1 for f in json.load(sys.stdin)["features"] if "demo" in f["properties"]))')"
h=$(curl -sI -H 'accept-encoding: gzip' "$URL/api/colonias/geometria")
has "geometría con caché público" "cache-control" "$(echo "$h" | tr 'A-Z' 'a-z')"
has "geometría comprimida (gzip/br)" "content-encoding" "$(echo "$h" | tr 'A-Z' 'a-z')"
eq "/api/colonias/[id] devuelve el contrato" "true" "$(curl -s "$URL/api/colonias/$(nueva_colonia 20)" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(all(k in d for k in ["id","nombre","municipio","reportes","oficial"]) and all(k in d["reportes"] for k in ["n","score","nivel","confianza","serie"])).lower())')"
eq "/api/colonias/[id] inexistente: 404" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/colonias/99999999")"
eq "/api/colonias/[id] no numérico: 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/colonias/abc")"
eq "/api/v1/colonias es GeoJSON" "FeatureCollection" "$(curl -s "$URL/api/v1/colonias" | python3 -c 'import sys,json;print(json.load(sys.stdin)["type"])')"
hv=$(curl -sI "$URL/api/v1/colonias" | tr 'A-Z' 'a-z')
has "/api/v1 con CORS abierto" "access-control-allow-origin: *" "$hv"
has "/api/v1 declara licencia" "x-licencia" "$hv"
eq "OPTIONS /api/v1 responde 204" "204" "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$URL/api/v1/colonias")"
csv=$(curl -s "$URL/api/v1/resumen.csv")
has "CSV abierto: encabezado con nombre,municipio,nivel,confianza" "nombre,municipio" "$(echo "$csv" | head -1)"
eq "CSV abierto SIN columna de huella (n_huellas es solo un conteo)" "0" "$(echo "$csv" | head -1 | tr ',' '\n' | grep -cx 'huella')"
eq "CSV abierto SIN columnas de red/UA/IP" "0" "$(echo "$csv" | head -1 | tr ',' '\n' | grep -ciE '^(red_|ua_|ip)')"
nohas "CSV abierto SIN comentarios" "comentario" "$(echo "$csv" | head -1 | tr 'A-Z' 'a-z')"
eq "openapi.json es JSON válido" "true" "$(curl -s "$URL/openapi.json" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str("paths" in d).lower())')"
eq "manifest PWA es JSON válido con nombre" "true" "$(curl -s "$URL/manifest.webmanifest" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(str(bool(d.get("name"))).lower())')"
eq "imagen Open Graph es PNG" "image/png" "$(curl -sI "$URL/opengraph-image" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')"
eq "icono 192 existe" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/icon/192")"
eq "/api/oficial/resumen responde" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/oficial/resumen")"
fi

# ═════════════ 14. SEGURIDAD Y ANTI-ABUSO (API) ═════════════
if corre seguridad; then sec "14. Seguridad y anti-abuso del POST /api/reportes"
sql "DELETE FROM reportes; DELETE FROM rate_limits;" >/dev/null
# OJO: los JSON se arman en variables (bash 3.2 de macOS parte las llaves con comas dentro de $(...))
c=$(nueva_colonia 40); UA="Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile"
j() { printf '{"colonia_id":%s,"gravedad":%s%s}' "$1" "$2" "${3:+,$3}"; }
B=$(j "$c" 2 '"sintomas":[],"hp":"","tiempo_ms":9000')
eq "reporte válido: 201" "201" "$(post 203.0.113.10 "$UA" "$B")"
eq "mismo reporte enseguida: 429 con Retry-After" "429" "$(post 203.0.113.10 "$UA" "$B")"
has "429 de reenvío trae Retry-After" "retry-after" "$(tr 'A-Z' 'a-z' < "$OUT/hdr.txt")"
b=$(j "$c" 9);                                    eq "gravedad fuera de rango: 400" "400" "$(post 203.0.113.11 "$UA" "$b")"
b=$(j "$c" -1);                                   eq "gravedad negativa: 400" "400" "$(post 203.0.113.11 "$UA" "$b")"
eq "sin gravedad (campo ausente): 400" "400" "$(post 203.0.113.11 "$UA" "{\"colonia_id\":$c}")"
# 0 («Limpia», desde v3) y null («Hoy no llegó agua», desde v4) son válidos; otra red para no gastar el cupo de 203.0.113.x
b=$(j "$c" 0 '"hp":"","tiempo_ms":9000');        eq "gravedad 0 (limpia): 201" "201" "$(post 192.0.2.10 "$UA" "$b")"
b=$(j "$c" null '"hp":"","tiempo_ms":9000');     eq "gravedad null (no llegó agua): 201" "201" "$(post 192.0.2.11 "$UA" "$b")"
eq "«no llegó agua» se guarda sin gravedad y con su síntoma" "1" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id = $c AND gravedad IS NULL AND 'Sin agua / baja presión' = ANY (sintomas)")"
b=$(j "$c" 2 '"sintomas":["<script>"]');          eq "síntoma fuera del catálogo: 400" "400" "$(post 203.0.113.11 "$UA" "$b")"
eq "JSON roto: 400" "400" "$(post 203.0.113.11 "$UA" '{no es json')"
eq "colonia inexistente: 404" "404" "$(post 203.0.113.12 "$UA" "$(j 99999999 2)")"
eq "colonia_id gigante (>int4): 400" "400" "$(post 203.0.113.12 "$UA" "$(j 99999999999999 2)")"
eq "colonia_id como texto: 400" "400" "$(post 203.0.113.12 "$UA" '{"colonia_id":"1; DROP TABLE reportes","gravedad":2}')"
eq "origen de otro sitio: 403" "403" "$(post 203.0.113.13 "$UA" "$B" "https://sitio-malicioso.example")"
GRANDE=$(python3 -c 'print("a"*6000)'); b=$(j "$c" 2 "\"comentario\":\"$GRANDE\"")
eq "cuerpo enorme: 413" "413" "$(post 203.0.113.14 "$UA" "$b")"
eq "Content-Type incorrecto: 415" "415" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/reportes" -H 'content-type: text/plain' -H "origin: $URL" -d "$B")"
eq "GET no permitido: 405" "405" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/reportes")"
C501=$(python3 -c 'print("a"*501)'); b=$(j "$c" 2 "\"comentario\":\"$C501\"")
eq "comentario de 501 caracteres: 400" "400" "$(post 203.0.113.15 "$UA" "$b")"
echo "  · inyección SQL: no afecta la base"
b=$(j "$c" 2 "\"comentario\":\"x'; DROP TABLE reportes; --\"")
post 203.0.113.16 "$UA" "$b" >/dev/null
eq "la tabla reportes sigue existiendo tras un intento de inyección" "t" "$(sql "SELECT to_regclass('reportes') IS NOT NULL")"
echo "  · bots"
cb=$(nueva_colonia 41)
b=$(j "$cb" 4 '"hp":"http://spam","tiempo_ms":9000')
eq "honeypot lleno: responde 201 (no revela la defensa)" "201" "$(post 203.0.113.20 "$UA" "$b")"
eq "…pero queda marcado sospechoso" "t" "$(sql "SELECT sospechoso FROM reportes WHERE colonia_id=$cb ORDER BY id DESC LIMIT 1")"
b=$(j "$cb" 4 '"hp":"","tiempo_ms":200')
eq "formulario en 200 ms: 201" "201" "$(post 203.0.113.21 "$UA" "$b")"
eq "…ambos reportes quedan sospechosos" "2" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$cb AND sospechoso")"
eq "los sospechosos NO cuentan en el nivel" "0" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$cb AND NOT sospechoso AND estado='visible'")"
echo "  · cupo por huella"
for i in 50 51 52 53; do
  cx=$(nueva_colonia $i); b=$(j "$cx" 1 '"hp":"","tiempo_ms":9000'); code=$(post 203.0.113.30 "$UA" "$b"); echo "    colonia #$i -> $code"
done
eq "la 4.ª colonia distinta de la misma huella: 429" "429" "$code"
echo "  · X-Forwarded-For falso no evita los límites"
ult=""; for i in 1 2 3 4 5 6 7 8 9 10; do
  cx=$(nueva_colonia 60); b=$(j "$cx" 4 '"hp":"","tiempo_ms":9000'); ult=$(post "198.51.100.$i, 203.0.113.99" "$UA" "$b"); done
eq "rotar la IP más a la izquierda no da huellas nuevas (una sola huella real)" "429" "$ult"
echo "  · admin sin credenciales"
eq "GET /api/admin/moderacion sin sesión: 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/admin/moderacion")"
eq "login con token incorrecto: 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/admin/sesion" -H 'content-type: application/json' -H "origin: $URL" -d '{"token":"incorrecto-incorrecto"}')"
echo "  · cabeceras de seguridad"
H=$(curl -sI "$URL/" | tr 'A-Z' 'a-z')
has "CSP presente" "content-security-policy" "$H"
has "CSP restringe frame-ancestors/default-src" "default-src" "$H"
has "HSTS presente" "strict-transport-security" "$H"
has "nosniff" "x-content-type-options: nosniff" "$H"
has "Referrer-Policy" "referrer-policy" "$H"
has "Permissions-Policy limita geolocalización" "geolocation=(self)" "$H"
nohas "no revela X-Powered-By" "x-powered-by" "$H"
echo "  · XSS: nombres/comentarios nunca se interpretan como HTML"
xc=$(nueva_colonia 70); b=$(j "$xc" 2 '"comentario":"<img src=x onerror=alert(1)> <script>alert(2)</script>","hp":"","tiempo_ms":9000'); post 203.0.113.40 "$UA" "$b" >/dev/null
nohas "la API v1 no expone comentarios" "onerror" "$(curl -s "$URL/api/v1/colonias/$xc")"
fi

# ═════════════ 15. MODERACIÓN (/admin) EN EL NAVEGADOR ═════════════
if corre admin; then sec "15. Panel de moderación /admin"
sql "DELETE FROM reportes; DELETE FROM rate_limits;" >/dev/null
c=$(nueva_colonia 80)
sql "INSERT INTO reportes (colonia_id,gravedad,sintomas,huella,red_hash,red_sem,ua_familia,tiempo_ms,canal,estado,motivo,creado_en,dia)
     SELECT $c, 4, '{}', 'e2e-adm-'||i, 'e2e-adm-r', 'e2e-adm-s', 'chrome-android', 9000, 'web', 'revision', 'rafaga de prueba', now(), current_date FROM generate_series(1,3) i" >/dev/null
ab cookies clear >/dev/null 2>&1
ab open "$URL/admin" >/dev/null; wl
has "sin sesión: pide el token" "Token de administración" "$(txt)"
shot 15-admin-login
ab fill "#token" "token-equivocado-123456" >/dev/null; click button "Entrar"; sleep 1.2
re "token equivocado: mensaje de error y sigue sin acceso" 'No autorizado|incorrecto|inválido|Token' "$(txt)"
nohas "token equivocado: no muestra la cola" "Cola de revisión" "$(txt)"
ab fill "#token" "$ADMIN_TOKEN" >/dev/null; click button "Entrar"; sleep 2
has "token correcto: muestra la cola de revisión" "Cola de revisión" "$(txt)"
has "la cola trae los 3 reportes en revisión" "3 reportes" "$(txt)"
shot 15-admin-cola
sc=$(curl -si -X POST "$URL/api/admin/sesion" -H 'content-type: application/json' -H "origin: $URL" -d "{\"token\":\"$ADMIN_TOKEN\"}" | tr 'A-Z' 'a-z' | grep '^set-cookie')
has "cookie de sesión: HttpOnly" "httponly" "$sc"
has "cookie de sesión: SameSite=Strict" "samesite=strict" "$sc"
has "cookie de sesión: Secure" "secure" "$sc"
eq "document.cookie no expone la sesión (HttpOnly)" "" "$(ev 'document.cookie')"
primero=$(sql "SELECT min(id) FROM reportes WHERE colonia_id=$c")
# la bitácora es de solo agregado (no se limpia entre corridas): se comparan conteos relativos
L_OC=$(sql "SELECT count(*) FROM moderacion_log WHERE accion='ocultar' AND colonia_id=$c"); L_RE=$(sql "SELECT count(*) FROM moderacion_log WHERE accion='restaurar' AND colonia_id=$c")
echo "  · ocultar exige motivo y confirmación"
ab click "input[aria-label='Seleccionar reporte $primero']" >/dev/null 2>&1
click button "Ocultar"; sleep 1
has "sin motivo: pide escribirlo" "Escribe el motivo" "$(txt)"
eq "sin motivo no se oculta nada" "0" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c AND estado='oculto'")"
ab fill "input[aria-label='Motivo']" "prueba e2e: ráfaga de una sola red" >/dev/null
click button "Ocultar"; sleep 0.5; ab dialog dismiss >/dev/null 2>&1; sleep 0.8
eq "si se CANCELA la confirmación no se oculta nada" "0" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c AND estado='oculto'")"
click button "Ocultar"; sleep 0.5; ab dialog accept >/dev/null 2>&1; sleep 1.8
eq "al confirmar con motivo: SOLO el reporte seleccionado queda oculto" "1|$primero" "$(sql "SELECT count(*)||'|'||min(id) FROM reportes WHERE colonia_id=$c AND estado='oculto'")"
eq "la acción queda en la bitácora con actor de moderador" "$((L_OC+1))" "$(sql "SELECT count(*) FROM moderacion_log WHERE accion='ocultar' AND colonia_id=$c AND actor LIKE 'mod:%' AND motivo LIKE 'prueba e2e%'")"
sql "UPDATE moderacion_log SET motivo='alterado' WHERE colonia_id=$c" >/dev/null
eq "la bitácora no se puede editar (trigger)" "0" "$(sql "SELECT count(*) FROM moderacion_log WHERE motivo='alterado'")"
sql "DELETE FROM moderacion_log WHERE colonia_id=$c" >/dev/null
eq "la bitácora no se puede borrar (trigger)" "$((L_OC+1))" "$(sql "SELECT count(*) FROM moderacion_log WHERE accion='ocultar' AND colonia_id=$c")"
shot 15-admin-tras-ocultar
echo "  · restaurar desde «Ver reportes de una colonia»"
ab fill "input[aria-label='Id de colonia']" "$c" >/dev/null; click button "Buscar"; sleep 1.5
ab click "input[aria-label='Seleccionar reporte $primero']" >/dev/null 2>&1
ab fill "$(lastref textbox Motivo)" "prueba e2e: el reporte era legítimo" >/dev/null
ab click "$(lastref button 'Restaurar')" >/dev/null; sleep 0.5; ab dialog accept >/dev/null 2>&1; sleep 1.8
eq "restaurar devuelve el reporte a «visible»" "visible" "$(sql "SELECT estado FROM reportes WHERE id=$primero")"
eq "la restauración también queda en la bitácora" "$((L_RE+1))" "$(sql "SELECT count(*) FROM moderacion_log WHERE accion='restaurar' AND colonia_id=$c")"
echo "  · cerrar sesión"
click button "Cerrar sesión"; sleep 1.5
has "Cerrar sesión devuelve al formulario de token" "Token de administración" "$(txt)"
eq "sin sesión de nuevo, la API admin da 401" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/admin/moderacion")"
fi

# ═════════════ 16. RETENCIÓN (pnpm purge) ═════════════
if corre purga; then sec "16. Retención: pnpm purge anonimiza a los 30 días"
sql "DELETE FROM reportes; DELETE FROM rate_limits;" >/dev/null
c=$(nueva_colonia 90)
semilla "$c" 5 5 2 1
sql "UPDATE reportes SET comentario='dato personal de prueba', creado_en=now()-interval '40 days', dia=(now()-interval '40 days')::date WHERE colonia_id=$c" >/dev/null
eq "antes de purgar: hay huellas guardadas" "5" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c AND huella IS NOT NULL")"
( cd "$APP_DIR" && DATABASE_URL="$DB_URL" pnpm purge >"$OUT/purge.log" 2>&1 ); tail -2 "$OUT/purge.log" | sed 's/^/    /'
eq "después: huellas y redes anonimizadas" "0" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c AND (huella IS NOT NULL OR red_hash IS NOT NULL OR red_sem IS NOT NULL)")"
eq "después: comentarios borrados" "0" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c AND comentario IS NOT NULL")"
eq "los reportes siguen existiendo (solo se anonimizan)" "5" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c")"
( cd "$APP_DIR" && DATABASE_URL="$DB_URL" pnpm purge >/dev/null 2>&1 )
eq "purgar de nuevo es idempotente" "5" "$(sql "SELECT count(*) FROM reportes WHERE colonia_id=$c")"
fi

# ───────────── resumen ─────────────
ab close >/dev/null 2>&1
echo; echo "════════════════════════════════════════"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "  Detalle: $RES   Capturas: $OUT/shots"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
