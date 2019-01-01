import googleTranslateApi from 'google-translate-api/languages'


export const allAvailableLanguages = [
    {
        'language': 'Afrikaans',
        'countryCodes': [
            {
                'langCode': 'af-ZA',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Bahasa Indonesia',
        'countryCodes': [
            {
                'langCode': 'id-ID',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Bahasa Melayu',
        'countryCodes': [
            {
                'langCode': 'ms-MY',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Català',
        'countryCodes': [
            {
                'langCode': 'ca-ES',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Čeština',
        'countryCodes': [
            {
                'langCode': 'cs-CZ',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Dansk',
        'countryCodes': [
            {
                'langCode': 'da-DK',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Deutsch',
        'countryCodes': [
            {
                'langCode': 'de-DE',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'English',
        'countryCodes': [
            {
                'langCode': 'en-AU',
                'country': 'Australia'
            },
            {
                'langCode': 'en-CA',
                'country': 'Canada'
            },
            {
                'langCode': 'en-IN',
                'country': 'India'
            },
            {
                'langCode': 'en-NZ',
                'country': 'New Zealand'
            },
            {
                'langCode': 'en-ZA',
                'country': 'South Africa'
            },
            {
                'langCode': 'en-GB',
                'country': 'United Kingdom'
            },
            {
                'langCode': 'en-US',
                'country': 'United States'
            }
        ]
    },
    {
        'language': 'Español',
        'countryCodes': [
            {
                'langCode': 'es-AR',
                'country': 'Argentina'
            },
            {
                'langCode': 'es-BO',
                'country': 'Bolivia'
            },
            {
                'langCode': 'es-CL',
                'country': 'Chile'
            },
            {
                'langCode': 'es-CO',
                'country': 'Colombia'
            },
            {
                'langCode': 'es-CR',
                'country': 'Costa Rica'
            },
            {
                'langCode': 'es-EC',
                'country': 'Ecuador'
            },
            {
                'langCode': 'es-SV',
                'country': 'El Salvador'
            },
            {
                'langCode': 'es-ES',
                'country': 'España'
            },
            {
                'langCode': 'es-US',
                'country': 'Estados Unidos'
            },
            {
                'langCode': 'es-GT',
                'country': 'Guatemala'
            },
            {
                'langCode': 'es-HN',
                'country': 'Honduras'
            },
            {
                'langCode': 'es-MX',
                'country': 'México'
            },
            {
                'langCode': 'es-NI',
                'country': 'Nicaragua'
            },
            {
                'langCode': 'es-PA',
                'country': 'Panamá'
            },
            {
                'langCode': 'es-PY',
                'country': 'Paraguay'
            },
            {
                'langCode': 'es-PE',
                'country': 'Perú'
            },
            {
                'langCode': 'es-PR',
                'country': 'Puerto Rico'
            },
            {
                'langCode': 'es-DO',
                'country': 'República Dominicana'
            },
            {
                'langCode': 'es-UY',
                'country': 'Uruguay'
            },
            {
                'langCode': 'es-VE',
                'country': 'Venezuela'
            }
        ]
    },
    {
        'language': 'Euskara',
        'countryCodes': [
            {
                'langCode': 'eu-ES',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Filipino',
        'countryCodes': [
            {
                'langCode': 'fil-PH',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Français',
        'countryCodes': [
            {
                'langCode': 'fr-FR',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Galego',
        'countryCodes': [
            {
                'langCode': 'gl-ES',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Hrvatski',
        'countryCodes': [
            {
                'langCode': 'hr_HR',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'IsiZulu',
        'countryCodes': [
            {
                'langCode': 'zu-ZA',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Íslenska',
        'countryCodes': [
            {
                'langCode': 'is-IS',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Italiano',
        'countryCodes': [
            {
                'langCode': 'it-IT',
                'country': 'Italia'
            },
            {
                'langCode': 'it-CH',
                'country': 'Svizzera'
            }
        ]
    },
    {
        'language': 'Lietuvių',
        'countryCodes': [
            {
                'langCode': 'lt-LT',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Magyar',
        'countryCodes': [
            {
                'langCode': 'hu-HU',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Nederlands',
        'countryCodes': [
            {
                'langCode': 'nl-NL',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Norsk bokmål',
        'countryCodes': [
            {
                'langCode': 'nb-NO',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Polski',
        'countryCodes': [
            {
                'langCode': 'pl-PL',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Português',
        'countryCodes': [
            {
                'langCode': 'pt-BR',
                'country': 'Brasil'
            },
            {
                'langCode': 'pt-PT',
                'country': 'Portugal'
            }
        ]
    },
    {
        'language': 'Română',
        'countryCodes': [
            {
                'langCode': 'ro-RO',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Slovenščina',
        'countryCodes': [
            {
                'langCode': 'sl-SI',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Slovenčina',
        'countryCodes': [
            {
                'langCode': 'sk-SK',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Suomi',
        'countryCodes': [
            {
                'langCode': 'fi-FI',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Svenska',
        'countryCodes': [
            {
                'langCode': 'sv-SE',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Tiếng Việt',
        'countryCodes': [
            {
                'langCode': 'vi-VN',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Türkçe',
        'countryCodes': [
            {
                'langCode': 'tr-TR',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Ελληνικά',
        'countryCodes': [
            {
                'langCode': 'el-GR',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'български',
        'countryCodes': [
            {
                'langCode': 'bg-BG',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Pусский',
        'countryCodes': [
            {
                'langCode': 'ru-RU',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Српски',
        'countryCodes': [
            {
                'langCode': 'sr-RS',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'Українська',
        'countryCodes': [
            {
                'langCode': 'uk-UA',
                'country': 'Default'
            }
        ]
    },
    {
        'language': '한국어',
        'countryCodes': [
            {
                'langCode': 'ko-KR',
                'country': 'Default'
            }
        ]
    },
    {
        'language': '中文',
        'countryCodes': [
            {
                'langCode': 'cmn-Hans-CN',
                'country': '普通话 (中国大陆)'
            },
            {
                'langCode': 'cmn-Hans-HK',
                'country': '普通话 (香港)'
            },
            {
                'langCode': 'cmn-Hant-TW',
                'country': '中文 (台灣)'
            },
            {
                'langCode': 'yue-Hant-HK',
                'country': '粵語 (香港)'
            }
        ]
    },
    {
        'language': '日本語',
        'countryCodes': [
            {
                'langCode': 'ja-JP',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'हिन्दी',
        'countryCodes': [
            {
                'langCode': 'hi-IN',
                'country': 'Default'
            }
        ]
    },
    {
        'language': 'ภาษาไทย',
        'countryCodes': [
            {
                'langCode': 'th-TH',
                'country': 'Default'
            }
        ]
    }
]


export const speechLanguages = []
allAvailableLanguages.forEach(function(item){
    if(item.countryCodes.length > 1){
        item.countryCodes.forEach(function(countryItem){
            speechLanguages.push({value:countryItem.langCode,name:item.language + ' ('+countryItem.country+')'})
        })
    }else{
        speechLanguages.push({value:item.countryCodes[0].langCode,name:item.language})
    }
})



export const translateLanguages = []

Object.keys(googleTranslateApi).forEach(value => {
    if( typeof(googleTranslateApi[value]) === 'string')
        translateLanguages.push({value, name: googleTranslateApi[value]})
})
