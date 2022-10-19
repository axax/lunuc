import React from 'react'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import BaseLayout from 'client/components/layout/BaseLayout'
import {Button, Typography, TextField, DeleteIconButton, Chip, ContentBlock} from 'ui/admin'
import {graphql} from '../middleware/graphql'
import {_t} from 'util/i18n.mjs'

class UserProfileContainer extends React.Component {

    saveNoteTimeouts = {}


    constructor(props) {
        super(props)

        this.state = {
            usernameError: '',
            message: '',
            loading: false,
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.me && prevState.me !== nextProps.me) {
            return Object.assign({}, prevState, {
                me: nextProps.me,
                username: nextProps.me.username,
                email: nextProps.me.email,
                note: nextProps.me.note
            })
        }
        // No state update necessary
        return null
    }

    saveNote = (id, value, timeout) => {
        clearTimeout(this.saveNoteTimeouts[id])
        this.saveNoteTimeouts[id] = setTimeout(() => {
            console.log('save note', value)
            this.setState({loading: true})

            this.props.updateNote({value: value, id: id})
                .then(resp => {
                    this.setState({loading: false})
                })
                .catch(error => {
                    this.setState({loading: false})
                    console.error(error)
                })
        }, timeout)
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name

        if (target.name === 'note') {
            let note = this.state.note.map(
                (o) => {
                    if (target.id === o._id) {
                        return Object.assign({}, o, {value: value})
                    }
                    return o
                }
            )
            this.setState({
                [target.name]: note
            })
            // auto save note after 5s
            this.saveNote(target.id, value, 5000)
        } else {
            this.setState({
                [target.name]: value
            })
        }
    }


    handleBlur = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value

        if (this.saveNoteTimeouts[target.id]) {
            this.saveNote(target.id, value, 0)
        }
    }


    updateProfile = (e) => {
        e.preventDefault()
        this.setState({usernameError: '', loading: true})

        this.props.updateMe({username: this.state.username, email: this.state.email})
            .then(resp => {
                this.setState({loading: false})
            })
            .catch(res => {
                this.setState({loading: false})
                if (res.error) {
                    if (res.error.key === 'username.taken') {
                        this.setState({username: this.props.me.username, usernameError: res.error.message})
                    }
                }
            })
    }

    updatePassword = (e) => {
        e.preventDefault()

        const {password, passwordConfirm} = this.state

        if(password !== passwordConfirm){

            this.setState({passwordError: 'Passwörter stimmen nicht überrein'})
        }else{
            this.setState({passwordError: '', loading: true})
            this.props.updateMe({email: this.state.email, password, passwordConfirm})
                .then(resp => {
                    this.setState({password:'',passwordConfirm:'', passwordMessage: 'Passwort wurde gespeichert',loading: false})
                })
                .catch(res => {
                    this.setState({loading: false})
                    if (res.error) {
                        this.setState({passwordError: res.error.message})
                    }
                })
        }
    }

    createNote = (e) => {
        e.preventDefault()
        this.setState({loading: true})
        this.props.createNote()
            .then(resp => {
                this.setState({loading: false})
            })
            .catch(error => {
                this.setState({loading: false})
            })
    }

    deleteNote = (e, note) => {
        e.preventDefault()
        this.setState({loading: true})

        this.props.deleteNote({id: note._id})
            .then(resp => {
                this.setState({loading: false})
            })
            .catch(error => {
                this.setState({loading: false})
            })
    }

    render() {
        const {me} = this.props
        if (!me) return null
        console.log('render UserProfileContainer')
        const {username, email, password, passwordConfirm, passwordError, passwordMessage, usernameError, loading, note} = this.state
        let noteElements = []
        if (note) {
            note.forEach(
                (o) => noteElements.push(<div key={o._id} style={{display:'flex'}}>
                    <TextField multiline name="note" id={o._id} onBlur={this.handleBlur}
                               onChange={this.handleInputChange}
                               fullWidth={true}
                               defaultValue={o.value}/>
                    <DeleteIconButton id={o._id} onClick={(e) => this.deleteNote(e, o)}/>
                </div>)
            )
        }

        return (
            <BaseLayout key="baseLayout">
                <Typography variant="h3" component="h1" gutterBottom>{_t('Profile.title')}</Typography>


                <ContentBlock style={{maxWidth: '600px'}}>
                    <TextField fullWidth={true} type="text" label="Benutzername" name="username" value={username} onChange={this.handleInputChange}/>
                    <TextField fullWidth={true} type="email" label="Email" name="email" value={email} onChange={this.handleInputChange}/>
                    <Button onClick={this.updateProfile.bind(this)} variant="contained" color="primary">{_t('core.save')}</Button>
                    {usernameError ? <strong>{usernameError}</strong> : ''}

                </ContentBlock>

                <Typography variant="h4" component="h2" gutterBottom>{_t('Profile.changePassword')}</Typography>


                <ContentBlock style={{maxWidth: '600px'}}>
                    <TextField fullWidth={true} type="password" label="Password" name="password" value={password} onChange={this.handleInputChange}/>
                    <TextField fullWidth={true} type="password" label="Passwort bestätigen" name="passwordConfirm" value={passwordConfirm} onChange={this.handleInputChange}/>
                    <Button onClick={this.updatePassword.bind(this)} variant="contained" color="primary">{_t('core.save')}</Button>
                    {passwordError ? <strong>{passwordError}</strong> : ''}
                    {passwordMessage ? <strong>{passwordMessage}</strong> : ''}
                </ContentBlock>

                <Typography variant="h4" component="h2" gutterBottom>{_t('Profile.roleCapabilities')}</Typography>
                <Typography variant="subtitle2" component="p" gutterBottom>{_t('Profile.roleHint')}</Typography>


                <ContentBlock style={{maxWidth: '600px'}}>
                    <Typography variant="subtitle1" component="p" gutterBottom>{_t('Profile.currentRole', me.role)}</Typography>
                    {
                        me.role.capabilities.map((v, i) => {
                            return <Chip key={i} label={v}/>
                        })
                    }
                </ContentBlock>


                <Typography variant="h4" component="h2" gutterBottom>{_t('Profile.note')}</Typography>
                <ContentBlock>
                    {noteElements}
                    <br/>
                    <Button variant="contained" color="primary" onClick={this.createNote}>{_t('Profile.addNote')}</Button>
                </ContentBlock>


            </BaseLayout>
        )
    }
}


UserProfileContainer.propTypes = {
    me: PropTypes.object,
    updateMe: PropTypes.func.isRequired,
    createNote: PropTypes.func.isRequired,
    updateNote: PropTypes.func.isRequired,
    deleteNote: PropTypes.func.isRequired,
    loading: PropTypes.bool
}

const gqlQuery = 'query{me{username email _id note{_id value}role{_id name capabilities}}}'

const gqlUpdate = 'mutation updateMe($username:String,$email:String,$password:String,$passwordConfirm:String){updateMe(username:$username,email:$email,password:$password,passwordConfirm:$passwordConfirm){_id username}}'

const gqlUpdateNote = 'mutation updateNote($id: ID!, $value: String){updateNote(value:$value,_id:$id){_id value}}'

const gqlCreateNote = 'mutation createNote{createNote{_id value}}'

const gqlDeleteNote = 'mutation deleteNote($id: ID!){deleteNote(_id:$id){_id value}}'


const UserProfileContainerWithGql = compose(
    graphql(gqlQuery, {
        options() {
            return {
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, me}}) => ({
            me,
            loading
        })
    }),
    graphql(gqlUpdate, {
        props: ({ownProps, mutate}) => ({
            updateMe: (variables) => {
                return mutate({
                    variables
                })
            }
        })
    }),
    graphql(gqlUpdateNote, {
        props: ({ownProps, mutate}) => ({
            updateNote: (args) => mutate({variables: args})
        })
    }),
    graphql(gqlCreateNote, {
        props: ({ownProps, mutate}) => ({
            createNote: () => mutate({
                optimisticResponse: {
                    __typename: 'Mutation',
                    createNote: {
                        __typename: 'Note',
                        _id: '#' + new Date().getTime(),
                        status: 'creating',
                        value: ''
                    }
                },
                update: (proxy, {data: {createNote}}) => {
                    // Read the data from our cache for this query.
                    const storeData = proxy.readQuery({query: gqlQuery})
                    const newData = {...storeData.me}

                    // Add our note from the mutation to the end.
                    if (!newData.note) {
                        newData.note = []
                    } else {
                        newData.note = [...newData.note]
                    }
                    newData.note.push(createNote)
                    // Write our data back to the cache.
                    proxy.writeQuery({query: gqlQuery, data: {...storeData, me: newData}})
                },
            })
        })
    }),
    graphql(gqlDeleteNote, {
        props: ({ownProps, mutate}) => ({
            deleteNote: (args) => mutate({
                variables: args,
                optimisticResponse: {
                    __typename: 'Mutation',
                    deleteNote: {
                        __typename: 'Note',
                        _id: args.id,
                        status: 'deleting',
                        value: ''
                    }
                },
                update: (proxy, {data: {deleteNote}}) => {
                    // Read the data from our cache for this query.
                    const storeData = proxy.readQuery({query: gqlQuery})
                    const newData = {...storeData.me}
                    if (!newData.note) {
                        newData.note = []
                    } else {
                        newData.note = [...newData.note]
                    }
                    // Add our note from the mutation to the end.
                    newData.note = newData.note.filter(note => note._id !== deleteNote._id)
                    // Write our data back to the cache.
                    proxy.writeQuery({query: gqlQuery, data: {...storeData, me: newData}})
                },
            })
        })
    })
)
(UserProfileContainer)

export default UserProfileContainerWithGql
