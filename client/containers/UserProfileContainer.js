import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import KeyValueContainer from './KeyValueContainer'
import BaseLayout from 'client/components/layout/BaseLayout'
import {Button, Typography, TextField, Divider, DeleteIconButton, Chip} from 'ui/admin'


class UserProfileContainer extends React.Component {

    saveNoteTimeouts = {}


    constructor(props) {
        super(props)

        const {username, note} = props.me || {}

        this.state = {
            username,
            usernameError: '',
            message: '',
            loading: false,
            note
        }
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

        this.props.updateMe({username: this.state.username})
            .then(resp => {
                this.setState({loading: false})
            })
            .catch(error => {
                this.setState({loading: false})
                console.log(error)
                if (error.graphQLErrors.length > 0) {
                    const e = error.graphQLErrors[0]
                    if (e.key === 'username.taken') {
                        this.setState({username: this.props.me.username, usernameError: e.message})
                    }
                }
            })
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

    deleteNote = (e,note) => {
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


    componentWillReceiveProps(nextProps) {
        if (nextProps.me)
            this.setState({username: nextProps.me.username, note: nextProps.me.note})
    }

    render() {
        const {me} = this.props
        if( !me ) return <BaseLayout />

        const {username, usernameError, loading, note} = this.state

        let noteElements = []

        let hasManageKeyvalue = me && me.role.capabilities.includes('manage_keyvalues')

        if (note) {
            note.forEach(
                (o) => noteElements.push(<div key={o._id}>
					<TextField multiline name="note" id={o._id} onBlur={this.handleBlur} onChange={this.handleInputChange}
                              defaultValue={o.value}/>
                    <DeleteIconButton id={o._id} onClick={(e) => this.deleteNote(e, o)} />
                </div>)
            )
        }

        return (
            <BaseLayout>
                <Typography variant="display2" gutterBottom>Profile</Typography>


                <div>
                    <TextField type="text" name="username" value={username} onChange={this.handleInputChange}/>
                    <Button onClick={this.updateProfile.bind(this)} variant="raised" color="primary">Update profile</Button>
                    {usernameError ? <strong>{usernameError}</strong> : ''}

                </div>
                <Typography variant="display1" component="h2" gutterBottom>Role & capabilities</Typography>

                <p>Role {me.role.name}</p>
                {
                    me.role.capabilities.map((v,i) => {
                        return <Chip key={i} label={v} />
                    })
                }



                <Divider />
                <Typography variant="display1" component="h2" gutterBottom>Notes</Typography>
                {noteElements}
                <br />
                <Button variant="raised" color="primary" onClick={this.createNote}>Add new note</Button>
                {hasManageKeyvalue ?
                    <div>
                        <Divider />
                        <Typography variant="display1" component="h2" gutterBottom>KeyValue Store</Typography>

                        <KeyValueContainer />
                    </div> : ''}
                <Divider />

            </BaseLayout>
        )
    }
}


UserProfileContainer.propTypes = {
    /* apollo client props */
    me: PropTypes.object,
    updateMe: PropTypes.func.isRequired,
    createNote: PropTypes.func.isRequired,
    updateNote: PropTypes.func.isRequired,
    deleteNote: PropTypes.func.isRequired,
    loading: PropTypes.bool
}

const gqlQuery = gql`query {me{username email _id note{_id value}role{_id name capabilities}}}`


const gqlUpdate = gql`
  mutation updateMe($username: String){ updateMe(username:$username){_id username}}
`

const gqlUpdateNote = gql`
	mutation updateNote($id: ID!, $value: String){ updateNote(value:$value,_id:$id){_id value}}
`


const gqlCreateNote = gql`
	mutation createNote{createNote{_id value}}
`

const gqlDeleteNote = gql`
	mutation deleteNote($id: ID!){deleteNote(_id:$id){_id value}}
`


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
            updateMe: ({username}) => {
                return mutate({
                    variables: {username}
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
                    const data = proxy.readQuery({query: gqlQuery})
                    // Add our note from the mutation to the end.
                    data.me.note.push(createNote)
                    // Write our data back to the cache.
                    proxy.writeQuery({query: gqlQuery, data})
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
                    const data = proxy.readQuery({query: gqlQuery})
                    // Add our note from the mutation to the end.
                    data.me.note = data.me.note.filter(note => note._id !== deleteNote._id)
                    // Write our data back to the cache.
                    proxy.writeQuery({query: gqlQuery, data})
                },
            })
        })
    })
)
(UserProfileContainer)




/**
 * Connect the component to
 * the Redux store.
 */
export default UserProfileContainerWithGql