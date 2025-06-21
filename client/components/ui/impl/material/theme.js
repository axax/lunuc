import {createTheme} from '@mui/material'
import {blue, grey} from '@mui/material/colors'

export const defaultTheme = createTheme({
    palette: {
        primary: blue,
        mode: 'light',
        /* secondary: amber*/
        /*background: {
            default:'rgb(249,249,249)',
            dark: '#f4f6f8',
            paper: common.white
        }*/
    },
    typography: {
        display4: {
            fontSize: '3rem'
        },
        display3: {
            fontSize: '2.5rem'
        },
        display1: {
            margin: '1em 0 0.7em'
        }
    },
    /*spacing: (factor) => `${0.25 * factor}rem`,*/
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    fontSize: '0.875rem',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                root: {
                    zIndex: '9999 !important'
                }
            }
        },
        MuiSnackbar: {
            styleOverrides: {
                root: {
                    zIndex: '10000 !important'
                }
            }
        },
        MuiPopover: {
            styleOverrides: {
                root: {
                    zIndex: '9999 !important'
                }
            }
        },
        MuiTooltip: {
            styleOverrides: {
                popper: {
                    zIndex: '99999 !important'
                }
            }
        },
        MuiAutocomplete: {
            styleOverrides: {
                popper: {
                    zIndex: '99999 !important'
                }
            }
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    margin: '8px'
                }
            }
        },
        MuiInput: {
            styleOverrides: {
                root: {
                    margin: '8px'
                },
                formControl: {
                    margin: 0
                }
            }
        },
        MuiFormControl: {
            styleOverrides: {
                root: {
                    margin: '8px',
                    minWidth: '200px'
                },
                fullWidth: {
                    margin: '8px'
                }
            }
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    margin: '8px',
                    padding: '6px 16px'
                }
            }
        },
        MuiTextField: {
            defaultProps: {
                variant: 'standard',
            },
        },
        MuiNativeSelect: {
            defaultProps: {
                variant: 'standard',
            }
        },
        MuiInputLabel: {
            defaultProps: {
                variant: 'standard',
            }
        },
        MuiAppBar: {
            styleOverrides: {
                colorPrimary: {
                    background: `linear-gradient(to right bottom, ${blue[300]}, ${blue.A400})`
                }
            }
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    //backgroundColor: 'rgb(252,252,252)'
                }
            }
        }
    }
})

export const darkTheme = createTheme({
    palette: {
        mode: 'dark',
    },
})

export default defaultTheme