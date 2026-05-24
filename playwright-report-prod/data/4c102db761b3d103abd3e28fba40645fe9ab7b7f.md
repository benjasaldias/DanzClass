# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.features.spec.ts >> Availability — /agenda (read-only) >> "Mis horarios ocupados" section exists and is expandable
- Location: tests/e2e-production/smoke.features.spec.ts:31:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Ocupado')
Expected: visible
Error: strict mode violation: getByText('Ocupado') resolved to 2 elements:
    1) <p class="font-semibold text-sm text-gray-900 dark:text-dark-text">Mis horarios ocupados</p> aka getByRole('button', { name: 'Mis horarios ocupados Marca' })
    2) <span class="flex items-center gap-1.5">…</span> aka getByText('Ocupado', { exact: true })

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Ocupado')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - link "DanzClass DanzClass" [ref=e5] [cursor=pointer]:
          - /url: /feed
          - img "DanzClass" [ref=e6]:
            - generic [ref=e12]: dc
          - generic [ref=e13]: DanzClass
        - generic [ref=e14]:
          - link [ref=e15] [cursor=pointer]:
            - /url: /notifications
            - img [ref=e16]
          - link "PB" [ref=e19] [cursor=pointer]:
            - /url: /profile
            - generic [ref=e21]: PB
    - main [ref=e22]:
      - generic [ref=e23]:
        - generic [ref=e24]:
          - generic [ref=e25]:
            - heading "Mi Agenda" [level=1] [ref=e26]:
              - img [ref=e27]
              - text: Mi Agenda
            - generic [ref=e29]:
              - button "Mes" [ref=e30] [cursor=pointer]
              - button "Semana" [ref=e31] [cursor=pointer]
          - generic [ref=e32]:
            - generic [ref=e33]: Clases inscritas
            - generic [ref=e35]: Clases que dicto
            - generic [ref=e37]: Ensayos
        - generic [ref=e39]:
          - generic [ref=e40]:
            - generic [ref=e41]:
              - button [ref=e42] [cursor=pointer]:
                - img [ref=e43]
              - generic [ref=e45]: Mayo 2026
              - button [ref=e46] [cursor=pointer]:
                - img [ref=e47]
            - generic [ref=e49]:
              - generic [ref=e50]: L
              - generic [ref=e51]: M
              - generic [ref=e52]: X
              - generic [ref=e53]: J
              - generic [ref=e54]: V
              - generic [ref=e55]: S
              - generic [ref=e56]: D
            - generic [ref=e57]:
              - button "1" [ref=e62] [cursor=pointer]:
                - generic [ref=e63]: "1"
              - button "2" [ref=e64] [cursor=pointer]:
                - generic [ref=e65]: "2"
              - button "3" [ref=e66] [cursor=pointer]:
                - generic [ref=e67]: "3"
              - button "4" [ref=e68] [cursor=pointer]:
                - generic [ref=e69]: "4"
              - button "5" [ref=e70] [cursor=pointer]:
                - generic [ref=e71]: "5"
              - button "6" [ref=e72] [cursor=pointer]:
                - generic [ref=e73]: "6"
              - button "7" [ref=e74] [cursor=pointer]:
                - generic [ref=e75]: "7"
              - button "8" [ref=e76] [cursor=pointer]:
                - generic [ref=e77]: "8"
              - button "9" [ref=e78] [cursor=pointer]:
                - generic [ref=e79]: "9"
              - button "10" [ref=e80] [cursor=pointer]:
                - generic [ref=e81]: "10"
              - button "11" [ref=e82] [cursor=pointer]:
                - generic [ref=e83]: "11"
              - button "12" [ref=e84] [cursor=pointer]:
                - generic [ref=e85]: "12"
              - button "13" [ref=e86] [cursor=pointer]:
                - generic [ref=e87]: "13"
              - button "14" [ref=e88] [cursor=pointer]:
                - generic [ref=e89]: "14"
              - button "15" [ref=e90] [cursor=pointer]:
                - generic [ref=e91]: "15"
              - button "16" [ref=e92] [cursor=pointer]:
                - generic [ref=e93]: "16"
              - button "17" [ref=e94] [cursor=pointer]:
                - generic [ref=e95]: "17"
              - button "18" [ref=e96] [cursor=pointer]:
                - generic [ref=e97]: "18"
              - button "19" [ref=e98] [cursor=pointer]:
                - generic [ref=e99]: "19"
              - button "20" [ref=e100] [cursor=pointer]:
                - generic [ref=e101]: "20"
              - button "21" [ref=e102] [cursor=pointer]:
                - generic [ref=e103]: "21"
              - button "22" [ref=e104] [cursor=pointer]:
                - generic [ref=e105]: "22"
              - button "23" [ref=e106] [cursor=pointer]:
                - generic [ref=e107]: "23"
              - button "24" [ref=e108] [cursor=pointer]:
                - generic [ref=e109]: "24"
              - button "25" [ref=e110] [cursor=pointer]:
                - generic [ref=e111]: "25"
              - button "26" [ref=e112] [cursor=pointer]:
                - generic [ref=e113]: "26"
              - button "27" [ref=e114] [cursor=pointer]:
                - generic [ref=e115]: "27"
              - button "28" [ref=e116] [cursor=pointer]:
                - generic [ref=e117]: "28"
              - button "29" [ref=e118] [cursor=pointer]:
                - generic [ref=e119]: "29"
              - button "30" [ref=e120] [cursor=pointer]:
                - generic [ref=e121]: "30"
              - button "31" [ref=e122] [cursor=pointer]:
                - generic [ref=e123]: "31"
            - generic [ref=e125]:
              - heading "Domingo, 24 de Mayo" [level=2] [ref=e126]
              - paragraph [ref=e127]: Sin compromisos este día
          - generic [ref=e128]:
            - button "Mis horarios ocupados Marca cuándo no puedes bailar — el resto se asume libre" [active] [ref=e129] [cursor=pointer]:
              - generic [ref=e130]:
                - paragraph [ref=e131]: Mis horarios ocupados
                - paragraph [ref=e132]: Marca cuándo no puedes bailar — el resto se asume libre
              - img [ref=e133]
            - generic [ref=e135]:
              - generic [ref=e136]:
                - img [ref=e137]
                - generic [ref=e139]: Duermo de
                - combobox [ref=e140]:
                  - option "00:00" [selected]
                  - option "01:00"
                  - option "02:00"
                  - option "03:00"
                  - option "04:00"
                  - option "05:00"
                  - option "06:00"
                  - option "07:00"
                  - option "08:00"
                  - option "09:00"
                  - option "10:00"
                  - option "11:00"
                  - option "12:00"
                  - option "13:00"
                  - option "14:00"
                  - option "15:00"
                  - option "16:00"
                  - option "17:00"
                  - option "18:00"
                  - option "19:00"
                  - option "20:00"
                  - option "21:00"
                  - option "22:00"
                  - option "23:00"
                - generic [ref=e141]: a
                - combobox [ref=e142]:
                  - option "00:00"
                  - option "01:00"
                  - option "02:00"
                  - option "03:00"
                  - option "04:00"
                  - option "05:00"
                  - option "06:00"
                  - option "07:00"
                  - option "08:00" [selected]
                  - option "09:00"
                  - option "10:00"
                  - option "11:00"
                  - option "12:00"
                  - option "13:00"
                  - option "14:00"
                  - option "15:00"
                  - option "16:00"
                  - option "17:00"
                  - option "18:00"
                  - option "19:00"
                  - option "20:00"
                  - option "21:00"
                  - option "22:00"
                  - option "23:00"
                - button "Guardar" [ref=e143] [cursor=pointer]
              - generic [ref=e144]:
                - generic [ref=e145]: Sueño
                - generic [ref=e147]: Ocupado
                - generic [ref=e149]: Libre
              - table [ref=e152]:
                - rowgroup [ref=e153]:
                  - row "Lun Mar Mié Jue Vie Sáb Dom" [ref=e154]:
                    - columnheader [ref=e155]
                    - columnheader "Lun" [ref=e156]
                    - columnheader "Mar" [ref=e157]
                    - columnheader "Mié" [ref=e158]
                    - columnheader "Jue" [ref=e159]
                    - columnheader "Vie" [ref=e160]
                    - columnheader "Sáb" [ref=e161]
                    - columnheader "Dom" [ref=e162]
                - rowgroup [ref=e163]:
                  - row "00 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e164]:
                    - cell "00" [ref=e165]
                    - cell "Horario de sueño" [ref=e166]:
                      - button "Horario de sueño" [disabled] [ref=e167]
                    - cell "Horario de sueño" [ref=e168]:
                      - button "Horario de sueño" [disabled] [ref=e169]
                    - cell "Horario de sueño" [ref=e170]:
                      - button "Horario de sueño" [disabled] [ref=e171]
                    - cell "Horario de sueño" [ref=e172]:
                      - button "Horario de sueño" [disabled] [ref=e173]
                    - cell "Horario de sueño" [ref=e174]:
                      - button "Horario de sueño" [disabled] [ref=e175]
                    - cell "Horario de sueño" [ref=e176]:
                      - button "Horario de sueño" [disabled] [ref=e177]
                    - cell "Horario de sueño" [ref=e178]:
                      - button "Horario de sueño" [disabled] [ref=e179]
                  - row "01 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e180]:
                    - cell "01" [ref=e181]
                    - cell "Horario de sueño" [ref=e182]:
                      - button "Horario de sueño" [disabled] [ref=e183]
                    - cell "Horario de sueño" [ref=e184]:
                      - button "Horario de sueño" [disabled] [ref=e185]
                    - cell "Horario de sueño" [ref=e186]:
                      - button "Horario de sueño" [disabled] [ref=e187]
                    - cell "Horario de sueño" [ref=e188]:
                      - button "Horario de sueño" [disabled] [ref=e189]
                    - cell "Horario de sueño" [ref=e190]:
                      - button "Horario de sueño" [disabled] [ref=e191]
                    - cell "Horario de sueño" [ref=e192]:
                      - button "Horario de sueño" [disabled] [ref=e193]
                    - cell "Horario de sueño" [ref=e194]:
                      - button "Horario de sueño" [disabled] [ref=e195]
                  - row "02 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e196]:
                    - cell "02" [ref=e197]
                    - cell "Horario de sueño" [ref=e198]:
                      - button "Horario de sueño" [disabled] [ref=e199]
                    - cell "Horario de sueño" [ref=e200]:
                      - button "Horario de sueño" [disabled] [ref=e201]
                    - cell "Horario de sueño" [ref=e202]:
                      - button "Horario de sueño" [disabled] [ref=e203]
                    - cell "Horario de sueño" [ref=e204]:
                      - button "Horario de sueño" [disabled] [ref=e205]
                    - cell "Horario de sueño" [ref=e206]:
                      - button "Horario de sueño" [disabled] [ref=e207]
                    - cell "Horario de sueño" [ref=e208]:
                      - button "Horario de sueño" [disabled] [ref=e209]
                    - cell "Horario de sueño" [ref=e210]:
                      - button "Horario de sueño" [disabled] [ref=e211]
                  - row "03 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e212]:
                    - cell "03" [ref=e213]
                    - cell "Horario de sueño" [ref=e214]:
                      - button "Horario de sueño" [disabled] [ref=e215]
                    - cell "Horario de sueño" [ref=e216]:
                      - button "Horario de sueño" [disabled] [ref=e217]
                    - cell "Horario de sueño" [ref=e218]:
                      - button "Horario de sueño" [disabled] [ref=e219]
                    - cell "Horario de sueño" [ref=e220]:
                      - button "Horario de sueño" [disabled] [ref=e221]
                    - cell "Horario de sueño" [ref=e222]:
                      - button "Horario de sueño" [disabled] [ref=e223]
                    - cell "Horario de sueño" [ref=e224]:
                      - button "Horario de sueño" [disabled] [ref=e225]
                    - cell "Horario de sueño" [ref=e226]:
                      - button "Horario de sueño" [disabled] [ref=e227]
                  - row "04 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e228]:
                    - cell "04" [ref=e229]
                    - cell "Horario de sueño" [ref=e230]:
                      - button "Horario de sueño" [disabled] [ref=e231]
                    - cell "Horario de sueño" [ref=e232]:
                      - button "Horario de sueño" [disabled] [ref=e233]
                    - cell "Horario de sueño" [ref=e234]:
                      - button "Horario de sueño" [disabled] [ref=e235]
                    - cell "Horario de sueño" [ref=e236]:
                      - button "Horario de sueño" [disabled] [ref=e237]
                    - cell "Horario de sueño" [ref=e238]:
                      - button "Horario de sueño" [disabled] [ref=e239]
                    - cell "Horario de sueño" [ref=e240]:
                      - button "Horario de sueño" [disabled] [ref=e241]
                    - cell "Horario de sueño" [ref=e242]:
                      - button "Horario de sueño" [disabled] [ref=e243]
                  - row "05 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e244]:
                    - cell "05" [ref=e245]
                    - cell "Horario de sueño" [ref=e246]:
                      - button "Horario de sueño" [disabled] [ref=e247]
                    - cell "Horario de sueño" [ref=e248]:
                      - button "Horario de sueño" [disabled] [ref=e249]
                    - cell "Horario de sueño" [ref=e250]:
                      - button "Horario de sueño" [disabled] [ref=e251]
                    - cell "Horario de sueño" [ref=e252]:
                      - button "Horario de sueño" [disabled] [ref=e253]
                    - cell "Horario de sueño" [ref=e254]:
                      - button "Horario de sueño" [disabled] [ref=e255]
                    - cell "Horario de sueño" [ref=e256]:
                      - button "Horario de sueño" [disabled] [ref=e257]
                    - cell "Horario de sueño" [ref=e258]:
                      - button "Horario de sueño" [disabled] [ref=e259]
                  - row "06 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e260]:
                    - cell "06" [ref=e261]
                    - cell "Horario de sueño" [ref=e262]:
                      - button "Horario de sueño" [disabled] [ref=e263]
                    - cell "Horario de sueño" [ref=e264]:
                      - button "Horario de sueño" [disabled] [ref=e265]
                    - cell "Horario de sueño" [ref=e266]:
                      - button "Horario de sueño" [disabled] [ref=e267]
                    - cell "Horario de sueño" [ref=e268]:
                      - button "Horario de sueño" [disabled] [ref=e269]
                    - cell "Horario de sueño" [ref=e270]:
                      - button "Horario de sueño" [disabled] [ref=e271]
                    - cell "Horario de sueño" [ref=e272]:
                      - button "Horario de sueño" [disabled] [ref=e273]
                    - cell "Horario de sueño" [ref=e274]:
                      - button "Horario de sueño" [disabled] [ref=e275]
                  - row "07 Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño Horario de sueño" [ref=e276]:
                    - cell "07" [ref=e277]
                    - cell "Horario de sueño" [ref=e278]:
                      - button "Horario de sueño" [disabled] [ref=e279]
                    - cell "Horario de sueño" [ref=e280]:
                      - button "Horario de sueño" [disabled] [ref=e281]
                    - cell "Horario de sueño" [ref=e282]:
                      - button "Horario de sueño" [disabled] [ref=e283]
                    - cell "Horario de sueño" [ref=e284]:
                      - button "Horario de sueño" [disabled] [ref=e285]
                    - cell "Horario de sueño" [ref=e286]:
                      - button "Horario de sueño" [disabled] [ref=e287]
                    - cell "Horario de sueño" [ref=e288]:
                      - button "Horario de sueño" [disabled] [ref=e289]
                    - cell "Horario de sueño" [ref=e290]:
                      - button "Horario de sueño" [disabled] [ref=e291]
                  - row "08 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e292]:
                    - cell "08" [ref=e293]
                    - cell "Libre — clic para marcar ocupado" [ref=e294]:
                      - button "Libre — clic para marcar ocupado" [ref=e295] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e296]:
                      - button "Libre — clic para marcar ocupado" [ref=e297] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e298]:
                      - button "Libre — clic para marcar ocupado" [ref=e299] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e300]:
                      - button "Libre — clic para marcar ocupado" [ref=e301] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e302]:
                      - button "Libre — clic para marcar ocupado" [ref=e303] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e304]:
                      - button "Libre — clic para marcar ocupado" [ref=e305] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e306]:
                      - button "Libre — clic para marcar ocupado" [ref=e307] [cursor=pointer]
                  - row "09 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e308]:
                    - cell "09" [ref=e309]
                    - cell "Libre — clic para marcar ocupado" [ref=e310]:
                      - button "Libre — clic para marcar ocupado" [ref=e311] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e312]:
                      - button "Libre — clic para marcar ocupado" [ref=e313] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e314]:
                      - button "Libre — clic para marcar ocupado" [ref=e315] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e316]:
                      - button "Libre — clic para marcar ocupado" [ref=e317] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e318]:
                      - button "Libre — clic para marcar ocupado" [ref=e319] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e320]:
                      - button "Libre — clic para marcar ocupado" [ref=e321] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e322]:
                      - button "Libre — clic para marcar ocupado" [ref=e323] [cursor=pointer]
                  - row "10 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e324]:
                    - cell "10" [ref=e325]
                    - cell "Libre — clic para marcar ocupado" [ref=e326]:
                      - button "Libre — clic para marcar ocupado" [ref=e327] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e328]:
                      - button "Libre — clic para marcar ocupado" [ref=e329] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e330]:
                      - button "Libre — clic para marcar ocupado" [ref=e331] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e332]:
                      - button "Libre — clic para marcar ocupado" [ref=e333] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e334]:
                      - button "Libre — clic para marcar ocupado" [ref=e335] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e336]:
                      - button "Libre — clic para marcar ocupado" [ref=e337] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e338]:
                      - button "Libre — clic para marcar ocupado" [ref=e339] [cursor=pointer]
                  - row "11 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e340]:
                    - cell "11" [ref=e341]
                    - cell "Libre — clic para marcar ocupado" [ref=e342]:
                      - button "Libre — clic para marcar ocupado" [ref=e343] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e344]:
                      - button "Libre — clic para marcar ocupado" [ref=e345] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e346]:
                      - button "Libre — clic para marcar ocupado" [ref=e347] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e348]:
                      - button "Libre — clic para marcar ocupado" [ref=e349] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e350]:
                      - button "Libre — clic para marcar ocupado" [ref=e351] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e352]:
                      - button "Libre — clic para marcar ocupado" [ref=e353] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e354]:
                      - button "Libre — clic para marcar ocupado" [ref=e355] [cursor=pointer]
                  - row "12 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e356]:
                    - cell "12" [ref=e357]
                    - cell "Libre — clic para marcar ocupado" [ref=e358]:
                      - button "Libre — clic para marcar ocupado" [ref=e359] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e360]:
                      - button "Libre — clic para marcar ocupado" [ref=e361] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e362]:
                      - button "Libre — clic para marcar ocupado" [ref=e363] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e364]:
                      - button "Libre — clic para marcar ocupado" [ref=e365] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e366]:
                      - button "Libre — clic para marcar ocupado" [ref=e367] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e368]:
                      - button "Libre — clic para marcar ocupado" [ref=e369] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e370]:
                      - button "Libre — clic para marcar ocupado" [ref=e371] [cursor=pointer]
                  - row "13 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e372]:
                    - cell "13" [ref=e373]
                    - cell "Libre — clic para marcar ocupado" [ref=e374]:
                      - button "Libre — clic para marcar ocupado" [ref=e375] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e376]:
                      - button "Libre — clic para marcar ocupado" [ref=e377] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e378]:
                      - button "Libre — clic para marcar ocupado" [ref=e379] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e380]:
                      - button "Libre — clic para marcar ocupado" [ref=e381] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e382]:
                      - button "Libre — clic para marcar ocupado" [ref=e383] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e384]:
                      - button "Libre — clic para marcar ocupado" [ref=e385] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e386]:
                      - button "Libre — clic para marcar ocupado" [ref=e387] [cursor=pointer]
                  - row "14 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e388]:
                    - cell "14" [ref=e389]
                    - cell "Libre — clic para marcar ocupado" [ref=e390]:
                      - button "Libre — clic para marcar ocupado" [ref=e391] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e392]:
                      - button "Libre — clic para marcar ocupado" [ref=e393] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e394]:
                      - button "Libre — clic para marcar ocupado" [ref=e395] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e396]:
                      - button "Libre — clic para marcar ocupado" [ref=e397] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e398]:
                      - button "Libre — clic para marcar ocupado" [ref=e399] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e400]:
                      - button "Libre — clic para marcar ocupado" [ref=e401] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e402]:
                      - button "Libre — clic para marcar ocupado" [ref=e403] [cursor=pointer]
                  - row "15 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e404]:
                    - cell "15" [ref=e405]
                    - cell "Libre — clic para marcar ocupado" [ref=e406]:
                      - button "Libre — clic para marcar ocupado" [ref=e407] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e408]:
                      - button "Libre — clic para marcar ocupado" [ref=e409] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e410]:
                      - button "Libre — clic para marcar ocupado" [ref=e411] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e412]:
                      - button "Libre — clic para marcar ocupado" [ref=e413] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e414]:
                      - button "Libre — clic para marcar ocupado" [ref=e415] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e416]:
                      - button "Libre — clic para marcar ocupado" [ref=e417] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e418]:
                      - button "Libre — clic para marcar ocupado" [ref=e419] [cursor=pointer]
                  - row "16 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e420]:
                    - cell "16" [ref=e421]
                    - cell "Libre — clic para marcar ocupado" [ref=e422]:
                      - button "Libre — clic para marcar ocupado" [ref=e423] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e424]:
                      - button "Libre — clic para marcar ocupado" [ref=e425] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e426]:
                      - button "Libre — clic para marcar ocupado" [ref=e427] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e428]:
                      - button "Libre — clic para marcar ocupado" [ref=e429] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e430]:
                      - button "Libre — clic para marcar ocupado" [ref=e431] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e432]:
                      - button "Libre — clic para marcar ocupado" [ref=e433] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e434]:
                      - button "Libre — clic para marcar ocupado" [ref=e435] [cursor=pointer]
                  - row "17 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e436]:
                    - cell "17" [ref=e437]
                    - cell "Libre — clic para marcar ocupado" [ref=e438]:
                      - button "Libre — clic para marcar ocupado" [ref=e439] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e440]:
                      - button "Libre — clic para marcar ocupado" [ref=e441] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e442]:
                      - button "Libre — clic para marcar ocupado" [ref=e443] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e444]:
                      - button "Libre — clic para marcar ocupado" [ref=e445] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e446]:
                      - button "Libre — clic para marcar ocupado" [ref=e447] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e448]:
                      - button "Libre — clic para marcar ocupado" [ref=e449] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e450]:
                      - button "Libre — clic para marcar ocupado" [ref=e451] [cursor=pointer]
                  - row "18 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e452]:
                    - cell "18" [ref=e453]
                    - cell "Libre — clic para marcar ocupado" [ref=e454]:
                      - button "Libre — clic para marcar ocupado" [ref=e455] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e456]:
                      - button "Libre — clic para marcar ocupado" [ref=e457] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e458]:
                      - button "Libre — clic para marcar ocupado" [ref=e459] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e460]:
                      - button "Libre — clic para marcar ocupado" [ref=e461] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e462]:
                      - button "Libre — clic para marcar ocupado" [ref=e463] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e464]:
                      - button "Libre — clic para marcar ocupado" [ref=e465] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e466]:
                      - button "Libre — clic para marcar ocupado" [ref=e467] [cursor=pointer]
                  - row "19 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e468]:
                    - cell "19" [ref=e469]
                    - cell "Libre — clic para marcar ocupado" [ref=e470]:
                      - button "Libre — clic para marcar ocupado" [ref=e471] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e472]:
                      - button "Libre — clic para marcar ocupado" [ref=e473] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e474]:
                      - button "Libre — clic para marcar ocupado" [ref=e475] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e476]:
                      - button "Libre — clic para marcar ocupado" [ref=e477] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e478]:
                      - button "Libre — clic para marcar ocupado" [ref=e479] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e480]:
                      - button "Libre — clic para marcar ocupado" [ref=e481] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e482]:
                      - button "Libre — clic para marcar ocupado" [ref=e483] [cursor=pointer]
                  - row "20 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e484]:
                    - cell "20" [ref=e485]
                    - cell "Libre — clic para marcar ocupado" [ref=e486]:
                      - button "Libre — clic para marcar ocupado" [ref=e487] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e488]:
                      - button "Libre — clic para marcar ocupado" [ref=e489] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e490]:
                      - button "Libre — clic para marcar ocupado" [ref=e491] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e492]:
                      - button "Libre — clic para marcar ocupado" [ref=e493] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e494]:
                      - button "Libre — clic para marcar ocupado" [ref=e495] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e496]:
                      - button "Libre — clic para marcar ocupado" [ref=e497] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e498]:
                      - button "Libre — clic para marcar ocupado" [ref=e499] [cursor=pointer]
                  - row "21 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e500]:
                    - cell "21" [ref=e501]
                    - cell "Libre — clic para marcar ocupado" [ref=e502]:
                      - button "Libre — clic para marcar ocupado" [ref=e503] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e504]:
                      - button "Libre — clic para marcar ocupado" [ref=e505] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e506]:
                      - button "Libre — clic para marcar ocupado" [ref=e507] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e508]:
                      - button "Libre — clic para marcar ocupado" [ref=e509] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e510]:
                      - button "Libre — clic para marcar ocupado" [ref=e511] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e512]:
                      - button "Libre — clic para marcar ocupado" [ref=e513] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e514]:
                      - button "Libre — clic para marcar ocupado" [ref=e515] [cursor=pointer]
                  - row "22 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e516]:
                    - cell "22" [ref=e517]
                    - cell "Libre — clic para marcar ocupado" [ref=e518]:
                      - button "Libre — clic para marcar ocupado" [ref=e519] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e520]:
                      - button "Libre — clic para marcar ocupado" [ref=e521] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e522]:
                      - button "Libre — clic para marcar ocupado" [ref=e523] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e524]:
                      - button "Libre — clic para marcar ocupado" [ref=e525] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e526]:
                      - button "Libre — clic para marcar ocupado" [ref=e527] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e528]:
                      - button "Libre — clic para marcar ocupado" [ref=e529] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e530]:
                      - button "Libre — clic para marcar ocupado" [ref=e531] [cursor=pointer]
                  - row "23 Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado Libre — clic para marcar ocupado" [ref=e532]:
                    - cell "23" [ref=e533]
                    - cell "Libre — clic para marcar ocupado" [ref=e534]:
                      - button "Libre — clic para marcar ocupado" [ref=e535] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e536]:
                      - button "Libre — clic para marcar ocupado" [ref=e537] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e538]:
                      - button "Libre — clic para marcar ocupado" [ref=e539] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e540]:
                      - button "Libre — clic para marcar ocupado" [ref=e541] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e542]:
                      - button "Libre — clic para marcar ocupado" [ref=e543] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e544]:
                      - button "Libre — clic para marcar ocupado" [ref=e545] [cursor=pointer]
                    - cell "Libre — clic para marcar ocupado" [ref=e546]:
                      - button "Libre — clic para marcar ocupado" [ref=e547] [cursor=pointer]
              - paragraph [ref=e548]: Los cambios se guardan automáticamente al hacer clic en cada bloque.
    - navigation [ref=e549]:
      - generic [ref=e551]:
        - link "Inicio" [ref=e552] [cursor=pointer]:
          - /url: /feed
          - img [ref=e553]
          - generic [ref=e556]: Inicio
        - link "Explorar" [ref=e557] [cursor=pointer]:
          - /url: /explore
          - img [ref=e558]
          - generic [ref=e561]: Explorar
        - link "Publicar" [ref=e562] [cursor=pointer]:
          - /url: /publish
          - img [ref=e563]
          - generic [ref=e565]: Publicar
        - link "Mis clases" [ref=e566] [cursor=pointer]:
          - /url: /my-classes
          - img [ref=e567]
          - generic [ref=e570]: Mis clases
        - link "Agenda" [ref=e571] [cursor=pointer]:
          - /url: /agenda
          - img [ref=e572]
          - generic [ref=e574]: Agenda
        - link "Perfil" [ref=e575] [cursor=pointer]:
          - /url: /profile
          - img [ref=e576]
          - generic [ref=e579]: Perfil
  - alert [ref=e580]
```

# Test source

```ts
  1   | /**
  2   |  * SMOKE — Non-destructive feature checks
  3   |  *
  4   |  * Safe for production: all tests are READ-ONLY.
  5   |  * - Availability: opens the section and inspects the UI — does NOT click any
  6   |  *   grid cell or press "Guardar". No DB writes.
  7   |  * - Publish video: opens the modal and inspects the form — does NOT submit.
  8   |  *   No posts are created.
  9   |  * - Feed CTA: reads text from existing cards — no data changed.
  10  |  *
  11  |  * Env vars required:
  12  |  *   E2E_USER_EMAIL
  13  |  *   E2E_USER_PASSWORD
  14  |  *
  15  |  * Env vars optional:
  16  |  *   E2E_EXPECT_OWN_CLASS=true  — set only if the test user has at least
  17  |  *                                one class they teach visible in the Global feed.
  18  |  *                                Without this, the CTA check is skipped.
  19  |  */
  20  | 
  21  | import { test, expect } from '@playwright/test'
  22  | import { loginAs } from './helpers/auth'
  23  | 
  24  | // ─── Availability ─────────────────────────────────────────────────────────────
  25  | 
  26  | test.describe('Availability — /agenda (read-only)', () => {
  27  |   test.beforeEach(async ({ page }) => {
  28  |     await loginAs(page)
  29  |   })
  30  | 
  31  |   test('"Mis horarios ocupados" section exists and is expandable', async ({ page }) => {
  32  |     const response = await page.goto('/agenda')
  33  |     if (response?.status() === 404) {
  34  |       test.skip()
  35  |       return
  36  |     }
  37  | 
  38  |     const toggle = page.getByRole('button', { name: /mis horarios ocupados/i })
  39  |     await expect(toggle).toBeVisible({ timeout: 15_000 })
  40  | 
  41  |     // Expand — READ-ONLY: we only look, we don't click any grid cell
  42  |     await toggle.click()
  43  | 
  44  |     // The 7×24 grid must appear
  45  |     const table = page.locator('table').first()
  46  |     await expect(table).toBeVisible({ timeout: 10_000 })
  47  | 
  48  |     // Legend labels indicate the UI is fully rendered
  49  |     await expect(page.getByText('Sueño')).toBeVisible()
> 50  |     await expect(page.getByText('Ocupado')).toBeVisible()
      |                                             ^ Error: expect(locator).toBeVisible() failed
  51  |     await expect(page.getByText('Libre')).toBeVisible()
  52  | 
  53  |     // Two sleep-config <select> elements must exist
  54  |     const selects = page.locator('select')
  55  |     await expect(selects).toHaveCount(2, { timeout: 5_000 })
  56  | 
  57  |     // "Guardar" button exists — but we do NOT click it
  58  |     await expect(page.getByRole('button', { name: /guardar/i })).toBeVisible()
  59  |   })
  60  | })
  61  | 
  62  | // ─── Publish video form ───────────────────────────────────────────────────────
  63  | 
  64  | test.describe('Publish video — form structure (read-only)', () => {
  65  |   test.beforeEach(async ({ page }) => {
  66  |     await loginAs(page)
  67  |   })
  68  | 
  69  |   test('/publish → Video modal has description textarea, NO city field', async ({ page }) => {
  70  |     await page.goto('/publish')
  71  |     await expect(page).not.toHaveURL(/auth\/login/)
  72  | 
  73  |     // Click the Video option to open the modal
  74  |     await page.getByRole('button', { name: /video/i }).click()
  75  | 
  76  |     // Description textarea must be present — this replaced the old "Ciudad" field
  77  |     const textarea = page.locator('textarea').first()
  78  |     await expect(textarea).toBeVisible({ timeout: 10_000 })
  79  | 
  80  |     // "Ciudad" must NOT appear (migration 021 removed it)
  81  |     await expect(page.getByLabel(/ciudad/i)).not.toBeVisible()
  82  |     await expect(page.getByPlaceholder(/ciudad/i)).not.toBeVisible()
  83  | 
  84  |     // Character counter (0/280) must be visible
  85  |     await expect(page.getByText('0/280')).toBeVisible()
  86  | 
  87  |     // The submit button exists — but we do NOT click it
  88  |     const submitBtn = page.getByRole('button', { name: /publicar/i })
  89  |     await expect(submitBtn).toBeVisible()
  90  |   })
  91  | })
  92  | 
  93  | // ─── Feed — ClassCard CTA ─────────────────────────────────────────────────────
  94  | 
  95  | test.describe('Feed — ClassCard CTA (read-only)', () => {
  96  |   test.beforeEach(async ({ page }) => {
  97  |     await loginAs(page)
  98  |   })
  99  | 
  100 |   test('every visible ClassCard shows "Ver clase", never "Editar" as primary CTA', async ({
  101 |     page,
  102 |   }) => {
  103 |     await page.goto('/feed')
  104 |     await page.getByRole('button', { name: /global/i }).click()
  105 | 
  106 |     // Wait for at least one card
  107 |     const firstCard = page.locator('article').first()
  108 |     await expect(firstCard).toBeVisible({ timeout: 15_000 })
  109 | 
  110 |     // Inspect up to the first 5 cards that are ClassCards (have a price section)
  111 |     const cards = page.locator('article')
  112 |     const count = await cards.count()
  113 |     const limit = Math.min(count, 5)
  114 | 
  115 |     for (let i = 0; i < limit; i++) {
  116 |       const card = cards.nth(i)
  117 |       const hasVerClase = (await card.getByRole('link', { name: /ver clase/i }).count()) > 0
  118 |       const hasEditarAsCTA =
  119 |         (await card.getByRole('link', { name: /^editar$/i }).count()) > 0
  120 | 
  121 |       if (hasVerClase) {
  122 |         // "Editar" must never appear as a top-level CTA alongside "Ver clase"
  123 |         expect(
  124 |           hasEditarAsCTA,
  125 |           `Card ${i + 1}: found "Editar" as CTA — ClassCard should only show "Ver clase"`,
  126 |         ).toBe(false)
  127 |       }
  128 |       // If neither is present the card is a PostCard — that's fine, skip it
  129 |     }
  130 |   })
  131 | 
  132 |   test('own-class card shows "Ver clase" CTA (conditional — set E2E_EXPECT_OWN_CLASS=true)', async ({
  133 |     page,
  134 |   }) => {
  135 |     if (process.env.E2E_EXPECT_OWN_CLASS !== 'true') {
  136 |       test.skip()
  137 |       return
  138 |     }
  139 | 
  140 |     await page.goto('/feed')
  141 |     await page.getByRole('button', { name: /global/i }).click()
  142 |     await page.waitForTimeout(1_500)
  143 | 
  144 |     // Find a ClassCard whose "Ver clase" link leads to a class the user owns.
  145 |     // We detect ownership by navigating to the detail page and checking for "Editar".
  146 |     const classLinks = page.locator('article').getByRole('link', { name: /ver clase/i })
  147 |     const linkCount = await classLinks.count()
  148 | 
  149 |     if (linkCount === 0) {
  150 |       // No classes visible in the current feed slice — informative skip
```